import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EventStatus,
  PaymentProvider,
  PaymentStatus,
  RegistrationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { PaymentSettlementService } from './payment-settlement.service';
import {
  SETTLEMENT_PAYMENT_INCLUDE,
  USER_PAYMENT_INCLUDE,
  isAllowedRedirectUrl,
  resolveIsoCountryCode,
  sanitizePaymentTicketVisibility,
} from './payments.constants';
import type {
  BictorysWebhookPayload,
  IPaymentGateway,
} from './interfaces/payment-gateway.interface';
import { PAYMENT_GATEWAY } from './interfaces/payment-gateway.interface';

@Injectable()
export class PaymentsService {
  private readonly feePercent: number;
  private readonly isProduction: boolean;
  private readonly allowedRedirectOrigins: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly settlementService: PaymentSettlementService,
    @Inject(PAYMENT_GATEWAY)
    private readonly paymentGateway: IPaymentGateway,
  ) {
    const configuredFee = Number(
      this.configService.get<string>('PLATFORM_FEE_PERCENT') ?? '3',
    );
    this.feePercent =
      Number.isFinite(configuredFee) && configuredFee >= 0 ? configuredFee : 3;

    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';
    this.isProduction = nodeEnv === 'production';
    this.allowedRedirectOrigins = this.buildAllowedRedirectOrigins();
  }

  /**
   * Calcule la commission plateforme (en entier, ex: XOF).
   */
  calculatePlatformFee(amount: number): number {
    if (amount <= 0 || this.feePercent <= 0) return 0;
    return Math.round((amount * this.feePercent) / 100);
  }

  /**
   * Initie un paiement Bictorys pour une inscription en attente (Registration PENDING).
   * À chaque paiement, l'utilisateur choisit directement son moyen de paiement (`provider` ou Hosted Checkout).
   */
  async initiatePayment(userId: string, dto: InitiatePaymentDto) {
    this.validateRedirectUrls(dto.successRedirectUrl, dto.errorRedirectUrl);

    const registration = await this.prisma.registration.findUnique({
      where: { id: dto.registrationId },
      include: {
        event: true,
        user: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Inscription introuvable');
    }

    if (registration.userId !== userId) {
      throw new ForbiddenException(
        'Vous ne pouvez régler que vos propres inscriptions',
      );
    }

    this.validatePayableRegistrationAndEvent(registration, registration.event);

    const selectedProvider = dto.provider || PaymentProvider.wave_money;
    const customerPhone = dto.phone?.trim() || null;
    const amount = registration.event.price;
    const currency = registration.event.currency || 'XOF';
    const fee = this.calculatePlatformFee(amount);

    // Création transactionnelle avec verrouillage de l'inscription (anti double-clic)
    const payment = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM registrations WHERE id = ${registration.id}::uuid FOR UPDATE
      `;

      const alreadySucceeded = await tx.payment.count({
        where: {
          registrationId: registration.id,
          status: PaymentStatus.SUCCESS,
        },
      });

      if (alreadySucceeded > 0) {
        throw new ConflictException('Cette inscription a déjà été réglée');
      }

      // Invalider d'éventuelles tentatives PENDING précédentes avant d'en créer une nouvelle
      await tx.payment.updateMany({
        where: {
          registrationId: registration.id,
          status: PaymentStatus.PENDING,
        },
        data: { status: PaymentStatus.FAILED },
      });

      return tx.payment.create({
        data: {
          registrationId: registration.id,
          userId,
          provider: selectedProvider,
          amount,
          fee,
          currency,
          status: PaymentStatus.PENDING,
        },
      });
    });

    const gatewayProvider = this.resolveGatewayMode(dto, selectedProvider);
    const customerName =
      [registration.user.firstName, registration.user.lastName]
        .filter(Boolean)
        .join(' ') ||
      registration.user.username ||
      'Participant RunHub';

    try {
      const gatewayResult = await this.paymentGateway.initiateCharge({
        paymentId: payment.id,
        amount,
        currency,
        provider: gatewayProvider,
        customer: {
          name: customerName,
          email: registration.user.email,
          phone: customerPhone,
          city: registration.user.city || registration.event.city,
          country: resolveIsoCountryCode(registration.event.country),
        },
        description: `Billet RunHub — ${registration.event.title}`,
        successRedirectUrl: dto.successRedirectUrl,
        errorRedirectUrl: dto.errorRedirectUrl,
      });

      const updatedPayment = gatewayResult.providerRef
        ? await this.prisma.payment.update({
            where: { id: payment.id },
            data: { providerRef: gatewayResult.providerRef },
            include: USER_PAYMENT_INCLUDE,
          })
        : await this.prisma.payment.findUniqueOrThrow({
            where: { id: payment.id },
            include: USER_PAYMENT_INCLUDE,
          });

      return {
        payment: sanitizePaymentTicketVisibility(updatedPayment),
        checkoutUrl: gatewayResult.checkoutUrl,
        providerRef: gatewayResult.providerRef,
      };
    } catch (error) {
      await this.prisma.payment
        .update({
          where: { id: payment.id },
          data: { status: PaymentStatus.FAILED },
        })
        .catch(() => {});
      throw error;
    }
  }

  /**
   * Façade de traitement du webhook Bictorys (délègue à PaymentSettlementService).
   */
  async handleBictorysWebhook(
    secretHeader: string | undefined,
    payload: BictorysWebhookPayload,
  ) {
    return this.settlementService.handleWebhook(secretHeader, payload);
  }

  /**
   * Vérifie activement le statut d'un paiement auprès de Bictorys (`GET /transactions/:id/status`)
   * et synchronise immédiatement le billet si le webhook a du retard.
   */
  async verifyAndSyncPayment(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: SETTLEMENT_PAYMENT_INCLUDE,
    });

    if (!payment) {
      throw new NotFoundException('Paiement introuvable');
    }

    if (payment.userId !== userId) {
      throw new ForbiddenException('Accès refusé à ce paiement');
    }

    if (payment.status === PaymentStatus.PENDING && payment.providerRef) {
      const remoteStatus = await this.paymentGateway.getTransactionStatus(
        payment.providerRef,
      );

      await this.settlementService.settlePaymentOutcome({
        payment,
        rawStatus: remoteStatus.status,
        externalRef: remoteStatus.providerRef,
        reportedAmount: remoteStatus.amount,
        reportedCurrency: remoteStatus.currency,
        rawPaymentType: remoteStatus.paymentType,
        rawPayload: remoteStatus.rawResponse,
      });
    }

    return this.findOneForUser(userId, paymentId);
  }

  /**
   * Historique paginé des paiements de l'utilisateur connecté.
   */
  async findMyPayments(userId: string, query: QueryPaymentsDto = {}) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId },
        include: USER_PAYMENT_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where: { userId } }),
    ]);

    return {
      items: items.map((p) => sanitizePaymentTicketVisibility(p)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Détail et statut d'un paiement spécifique appartenant à l'utilisateur.
   */
  async findOneForUser(userId: string, paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: USER_PAYMENT_INCLUDE,
    });

    if (!payment) {
      throw new NotFoundException('Paiement introuvable');
    }

    if (payment.userId !== userId) {
      throw new ForbiddenException('Accès refusé à ce paiement');
    }

    return sanitizePaymentTicketVisibility(payment);
  }

  // --- Méthodes privées métier ---

  private validateRedirectUrls(
    successRedirectUrl?: string,
    errorRedirectUrl?: string,
  ): void {
    if (
      successRedirectUrl &&
      !isAllowedRedirectUrl(
        successRedirectUrl,
        this.allowedRedirectOrigins,
        this.isProduction,
      )
    ) {
      throw new BadRequestException(
        'URL de redirection successRedirectUrl non autorisée.',
      );
    }

    if (
      errorRedirectUrl &&
      !isAllowedRedirectUrl(
        errorRedirectUrl,
        this.allowedRedirectOrigins,
        this.isProduction,
      )
    ) {
      throw new BadRequestException(
        'URL de redirection errorRedirectUrl non autorisée.',
      );
    }
  }

  private buildAllowedRedirectOrigins(): string[] {
    const origins = new Set<string>(['https://runhub.app']);

    const addUrlOrigin = (rawUrl?: string) => {
      if (!rawUrl) return;
      try {
        const parsed = new URL(rawUrl.trim());
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          origins.add(parsed.origin);
        }
      } catch {
        // ignore non-HTTP schemes like runhub://
      }
    };

    addUrlOrigin(this.configService.get<string>('BICTORYS_SUCCESS_URL'));
    addUrlOrigin(this.configService.get<string>('BICTORYS_ERROR_URL'));

    const allowedCors = this.configService.get<string>('ALLOWED_ORIGINS');
    if (allowedCors) {
      for (const item of allowedCors.split(',')) {
        addUrlOrigin(item);
      }
    }

    return Array.from(origins);
  }

  private validatePayableRegistrationAndEvent(
    registration: { status: RegistrationStatus },
    event: {
      status: EventStatus;
      price: number;
      startsAt: Date;
      endsAt: Date | null;
    },
  ): void {
    if (registration.status === RegistrationStatus.CANCELLED) {
      throw new BadRequestException(
        'Impossible de payer une inscription annulée',
      );
    }

    if (
      registration.status === RegistrationStatus.PAID ||
      registration.status === RegistrationStatus.CHECKED_IN
    ) {
      throw new ConflictException('Cette inscription a déjà été réglée');
    }

    if (event.price <= 0) {
      throw new BadRequestException(
        'Cet événement est gratuit : aucun paiement n’est requis',
      );
    }

    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException(
        'Impossible de payer pour un événement non publié ou annulé',
      );
    }

    const now = Date.now();
    const cutoffDate = event.endsAt ?? event.startsAt;
    if (cutoffDate && new Date(cutoffDate).getTime() < now) {
      throw new BadRequestException(
        'Impossible de payer pour un événement déjà terminé',
      );
    }
  }

  private resolveGatewayMode(
    dto: InitiatePaymentDto,
    selectedProvider: PaymentProvider,
  ): PaymentProvider | undefined {
    if (dto.useHostedCheckout === true) return undefined;
    if (dto.useHostedCheckout === false) return selectedProvider;
    return dto.provider ? selectedProvider : undefined;
  }
}
