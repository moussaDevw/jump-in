import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  EventStatus,
  PaymentStatus,
  Prisma,
  RegistrationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentNotificationsService } from './payment-notifications.service';
import {
  SETTLEMENT_PAYMENT_INCLUDE,
  SettlementPaymentRecord,
  classifyGatewayStatus,
  isUuid,
  resolveProviderFromGateway,
} from './payments.constants';
import type {
  BictorysWebhookPayload,
  IPaymentGateway,
} from './interfaces/payment-gateway.interface';
import { PAYMENT_GATEWAY } from './interfaces/payment-gateway.interface';

export interface SettlePaymentInput {
  payment: SettlementPaymentRecord;
  rawStatus: string;
  externalRef?: string;
  reportedAmount?: number;
  reportedCurrency?: string;
  rawPaymentType?: string;
  rawPayload?: Record<string, any>;
}

export interface SettlementOutcomeResult {
  received: boolean;
  processed: boolean;
  status?: PaymentStatus;
  reason?: string;
  paymentId?: string;
  registrationId?: string;
  refundRequired?: string;
}

@Injectable()
export class PaymentSettlementService {
  private readonly logger = new Logger(PaymentSettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentNotifications: PaymentNotificationsService,
    @Inject(PAYMENT_GATEWAY)
    private readonly paymentGateway: IPaymentGateway,
  ) { }

  /**
   * Valide la signature et traite un webhook entrant Bictorys de manière atomique et idempotente.
   */
  async handleWebhook(
    secretHeader: string | undefined,
    payload: BictorysWebhookPayload,
  ): Promise < SettlementOutcomeResult > {
    if(!this.paymentGateway.verifyWebhookSignature(secretHeader)) {
  this.logger.warn(
    '[Webhook Bictorys] Signature X-Secret-Key absente ou invalide.',
  );
  throw new UnauthorizedException('Signature webhook Bictorys invalide');
}

const internalPaymentId =
  payload.paymentReference ||
  payload.merchantReference ||
  payload.data?.paymentReference ||
  payload.data?.merchantReference;

const externalRef =
  payload.chargeId ||
  payload.transactionId ||
  payload.id ||
  payload.data?.chargeId ||
  payload.data?.transactionId ||
  payload.data?.id;

if (!internalPaymentId && !externalRef) {
  throw new BadRequestException(
    'Le payload webhook ne contient aucune référence de paiement exploitable.',
  );
}

const rawStatus = String(payload.status || payload.data?.status || '');
const reportedAmountRaw = payload.amount ?? payload.data?.amount;
const reportedAmount =
  reportedAmountRaw !== undefined ? Number(reportedAmountRaw) : undefined;
const reportedCurrency =
  payload.currency || payload.data?.currency || undefined;
const rawPaymentType =
  payload.paymentType ||
  payload.provider ||
  payload.data?.paymentType ||
  payload.data?.provider;

this.logger.log(
  `[Webhook Bictorys] Reçu: paymentReference=${internalPaymentId}, externalRef=${externalRef}, status=${rawStatus}`,
);

const payment = await this.findPaymentForSettlement(
  internalPaymentId,
  externalRef ? String(externalRef) : undefined,
);

if (!payment) {
  this.logger.warn(
    `[Webhook Bictorys] Aucun paiement trouvé pour paymentReference=${internalPaymentId} / externalRef=${externalRef}`,
  );
  return {
    received: true,
    processed: false,
    reason: 'payment_not_found',
  };
}

return this.settlePaymentOutcome({
  payment,
  rawStatus,
  externalRef: externalRef ? String(externalRef) : undefined,
  reportedAmount,
  reportedCurrency,
  rawPaymentType,
  rawPayload: payload,
});
  }

  /**
   * Applique de manière atomique le dénouement d'un paiement (SUCCESS ou FAILED) :
   * - Vérifie la concordance du montant et de la devise
   * - Empêche toute condition de course (double webhook simultané) via `updateMany` conditionnel
   * - Invalide les éventuelles tentatives parallèles PENDING et empêche les fausses notifications PAYMENT_FAILED
   * - Protège contre la sur-réservation (`SELECT ... FOR UPDATE` sur l'événement) si l'inscription avait été annulée
   * - Enregistre la trace complète dans `audit_logs`
   */
  async settlePaymentOutcome(
  input: SettlePaymentInput,
): Promise < SettlementOutcomeResult > {
  const {
    payment,
    rawStatus,
    externalRef,
    reportedAmount,
    reportedCurrency,
    rawPaymentType,
    rawPayload,
  } = input;

  if(payment.status === PaymentStatus.SUCCESS) {
  return {
    received: true,
    processed: false,
    reason: 'already_succeeded',
    paymentId: payment.id,
  };
}

const outcome = classifyGatewayStatus(rawStatus);
if (outcome === 'pending') {
  return {
    received: true,
    processed: false,
    reason: `intermediate_status_${rawStatus.toLowerCase().trim() || 'unknown'}`,
    paymentId: payment.id,
  };
}

const mappedProvider = resolveProviderFromGateway(
  rawPaymentType,
  payment.provider,
);
const finalProviderRef = externalRef || payment.providerRef;

if (outcome === 'success') {
  this.assertAmountAndCurrencyMatch(
    payment,
    reportedAmount,
    reportedCurrency,
  );

  const txResult = await this.prisma.$transaction(
    async (tx) => {
      // 1. Vérifier d'abord si une autre tentative pour la même inscription est déjà en SUCCESS
      // (évite de violer l'index unique partiel SQL `payments_one_success_per_registration_idx`)
      const otherSuccessCount = await tx.payment.count({
        where: {
          registrationId: payment.registrationId,
          id: { not: payment.id },
          status: PaymentStatus.SUCCESS,
        },
      });

      if (otherSuccessCount > 0) {
        this.logger.error(
          `[Remboursement Requis - Double Paiement] L'inscription ${payment.registrationId} possède déjà un paiement SUCCESS (doublon payment=${payment.id}).`,
        );
        await tx.auditLog.create({
          data: {
            actorId: payment.userId,
            entityType: 'Payment',
            entityId: payment.id,
            action: 'payment_duplicate_refund_required',
            before: { status: payment.status } as Prisma.InputJsonValue,
            after: (rawPayload ?? {
              rawStatus,
              externalRef: finalProviderRef,
            }) as Prisma.InputJsonValue,
          },
        });
        return {
          alreadyProcessed: false,
          registrationUpgraded: false,
          refundRequired: 'duplicate_payment_on_registration',
        };
      }

      // 2. Garde atomique contre deux webhooks parallèles sur le même Payment
      const updated = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: { not: PaymentStatus.SUCCESS },
        },
        data: {
          status: PaymentStatus.SUCCESS,
          provider: mappedProvider,
          ...(finalProviderRef ? { providerRef: finalProviderRef } : {}),
        },
      });

      if (updated.count === 0) {
        return { alreadyProcessed: true, registrationUpgraded: false };
      }

        // 3. Invalider immédiatement toute autre tentative PENDING restante pour cette inscription
        // (empêche l'envoi ultérieur d'un faux PAYMENT_FAILED quand une session concurrente expire)
        await tx.payment.updateMany({
          where: {
            registrationId: payment.registrationId,
            id: { not: payment.id },
            status: PaymentStatus.PENDING,
          },
          data: { status: PaymentStatus.FAILED },
        });

          // 4. Mettre à jour l'inscription en vérifiant la jauge si elle était CANCELLED
          const freshReg = await tx.registration.findUnique({
      where: { id: payment.registrationId },
    });

  let registrationUpgraded = false;
  let refundRequired: string | undefined;

    if (freshReg?.status === RegistrationStatus.PENDING) {
      await tx.registration.update({
        where: { id: freshReg.id },
        data: { status: RegistrationStatus.PAID },
      });
      registrationUpgraded = true;
    } else if (freshReg?.status === RegistrationStatus.CANCELLED) {
      const [lockedEvent] = await tx.$queryRaw<
        Array<{ id: string; status: string; capacity: number | null }>
      >`
              SELECT id, status, capacity
              FROM events
              WHERE id = ${freshReg.eventId}::uuid
              FOR UPDATE
            `;

      if (
        !lockedEvent ||
        lockedEvent.status !== EventStatus.PUBLISHED.toLowerCase()
      ) {
        this.logger.error(
          `[Remboursement Requis] Paiement ${payment.id} reçu pour une inscription annulée sur un événement non publié (${freshReg.eventId}).`,
        );
        refundRequired = 'event_not_published';
      } else if (lockedEvent.capacity !== null) {
        const activeCount = await tx.registration.count({
          where: {
            eventId: freshReg.eventId,
            status: { not: RegistrationStatus.CANCELLED },
          },
        });

        if (activeCount >= lockedEvent.capacity) {
          this.logger.error(
            `[Remboursement Requis - Capacité atteinte] Paiement ${payment.id} reçu après annulation mais l'événement ${freshReg.eventId} est complet (${activeCount}/${lockedEvent.capacity}).`,
          );
          refundRequired = 'event_full';
        }
      }

      if (!refundRequired) {
        await tx.registration.update({
          where: { id: freshReg.id },
          data: { status: RegistrationStatus.PAID },
        });
        registrationUpgraded = true;
      }
    }

    // 5. Journal d'audit financier immuable
    await tx.auditLog.create({
      data: {
        actorId: payment.userId,
        entityType: 'Payment',
        entityId: payment.id,
        action: refundRequired
          ? `payment_refund_required_${refundRequired}`
          : 'payment_succeeded',
        before: { status: payment.status } as Prisma.InputJsonValue,
        after: (rawPayload ?? {
          status: PaymentStatus.SUCCESS,
          provider: mappedProvider,
          providerRef: finalProviderRef,
        }) as Prisma.InputJsonValue,
      },
    });

    return {
      alreadyProcessed: false,
      registrationUpgraded,
      refundRequired,
    };
  },
  { timeout: 15000 },
      );

  if (txResult.alreadyProcessed) {
    return {
      received: true,
      processed: false,
      reason: 'already_succeeded',
      paymentId: payment.id,
    };
  }

  if (txResult.registrationUpgraded) {
    const participantName =
      [payment.user?.firstName, payment.user?.lastName]
        .filter(Boolean)
        .join(' ') ||
      payment.user?.username ||
      'Un participant';

    this.paymentNotifications.notifyPaymentSuccess({
      paymentId: payment.id,
      registrationId: payment.registrationId,
      eventId: payment.registration.eventId,
      eventTitle: payment.registration.event.title,
      organizerId: payment.registration.event.organizerId,
      userId: payment.userId,
      participantName,
      amount: payment.amount,
      currency: payment.currency,
    });
  }

  return {
    received: true,
    processed: true,
    status: PaymentStatus.SUCCESS,
    paymentId: payment.id,
    registrationId: payment.registrationId,
    ...(txResult.refundRequired
      ? { refundRequired: txResult.refundRequired }
      : {}),
  };
}

  // Cas d'échec / annulation / expiration
  const failTxResult = await this.prisma.$transaction(async (tx) => {
    const failedUpdate = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.FAILED,
        provider: mappedProvider,
        ...(finalProviderRef ? { providerRef: finalProviderRef } : {}),
      },
    });

    if (failedUpdate.count === 0) {
      return { updated: false, registrationAlreadyPaid: false };
    }

    const freshReg = await tx.registration.findUnique({
      where: { id: payment.registrationId },
      select: { status: true },
    });

    const registrationAlreadyPaid =
      freshReg?.status === RegistrationStatus.PAID ||
      freshReg?.status === RegistrationStatus.CHECKED_IN;

    await tx.auditLog.create({
      data: {
        actorId: payment.userId,
        entityType: 'Payment',
        entityId: payment.id,
        action: 'payment_failed',
        before: { status: payment.status } as Prisma.InputJsonValue,
        after: (rawPayload ?? {
          status: PaymentStatus.FAILED,
          rawStatus,
          providerRef: finalProviderRef,
        }) as Prisma.InputJsonValue,
      },
    });

    return { updated: true, registrationAlreadyPaid };
  });

    if (!failTxResult.updated) {
  return {
    received: true,
    processed: false,
    reason: 'already_finalized',
    paymentId: payment.id,
  };
}

// Ne notifier l'échec que si le billet n'a pas déjà été payé via une autre tentative !
if (!failTxResult.registrationAlreadyPaid) {
  this.paymentNotifications.notifyPaymentFailed({
    paymentId: payment.id,
    registrationId: payment.registrationId,
    eventId: payment.registration.eventId,
    eventTitle: payment.registration.event.title,
    userId: payment.userId,
    amount: payment.amount,
    currency: payment.currency,
  });
}

return {
  received: true,
  processed: true,
  status: PaymentStatus.FAILED,
  paymentId: payment.id,
  registrationId: payment.registrationId,
};
  }

  async findPaymentForSettlement(
  internalPaymentId ?: string,
  externalRef ?: string,
): Promise < SettlementPaymentRecord | null > {
  if(isUuid(internalPaymentId)) {
  const byId = await this.prisma.payment.findUnique({
    where: { id: internalPaymentId },
    include: SETTLEMENT_PAYMENT_INCLUDE,
  });
  if (byId) return byId;
}

if (externalRef) {
  return this.prisma.payment.findFirst({
    where: { providerRef: externalRef },
    include: SETTLEMENT_PAYMENT_INCLUDE,
  });
}

return null;
  }

  private assertAmountAndCurrencyMatch(
  payment: { id: string; amount: number; currency: string },
  reportedAmount ?: number,
  reportedCurrency ?: string,
): void {
  if(
    reportedAmount !== undefined &&
  Number.isFinite(reportedAmount) &&
  reportedAmount < payment.amount
    ) {
  this.logger.error(
    `[Sécurité Paiement] Montant incohérent pour payment=${payment.id} : reçu=${reportedAmount}, attendu=${payment.amount}`,
  );
  throw new BadRequestException(
    'Montant du paiement inférieur au prix attendu.',
  );
}

if (
  reportedCurrency &&
  reportedCurrency.trim().toUpperCase() !==
  payment.currency.trim().toUpperCase()
) {
  this.logger.error(
    `[Sécurité Paiement] Devise incohérente pour payment=${payment.id} : reçue=${reportedCurrency}, attendue=${payment.currency}`,
  );
  throw new BadRequestException(
    'Devise du paiement différente de la devise attendue.',
  );
}
  }
}
