import { Injectable, Logger } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

export interface PaymentNotificationContext {
  paymentId: string;
  registrationId: string;
  eventId: string;
  eventTitle: string;
  organizerId: string;
  userId: string;
  participantName: string;
  amount: number;
  currency: string;
}

@Injectable()
export class PaymentNotificationsService {
  private readonly logger = new Logger(PaymentNotificationsService.name);

  constructor(private readonly notificationsService: NotificationsService) { }

  /**
   * Notifie le participant que son paiement est validé ET notifie l'organisateur de la nouvelle inscription confirmée.
   */
  notifyPaymentSuccess(ctx: PaymentNotificationContext): void {
    this.notificationsService
      .sendLocalizedToUser(ctx.userId, {
        type: NotificationType.PAYMENT,
        template: 'PAYMENT_SUCCESS',
        eventId: ctx.eventId,
        params: {
          amount: ctx.amount,
          currency: ctx.currency,
          eventTitle: ctx.eventTitle,
        },
        data: {
          paymentId: ctx.paymentId,
          registrationId: ctx.registrationId,
          eventId: ctx.eventId,
          type: 'PAYMENT_SUCCESS',
        },
      })
      .catch((err) => {
        this.logger.error(
          `Échec d'envoi de la notification PAYMENT_SUCCESS pour payment=${ctx.paymentId}`,
          err,
        );
      });

    if (ctx.organizerId && ctx.organizerId !== ctx.userId) {
      this.notificationsService
        .sendLocalizedToUser(ctx.organizerId, {
          actorId: ctx.userId,
          eventId: ctx.eventId,
          type: NotificationType.JOIN,
          template: 'EVENT_REGISTRATION',
          params: {
            participantName: ctx.participantName,
            eventTitle: ctx.eventTitle,
          },
          data: {
            eventId: ctx.eventId,
            registrationId: ctx.registrationId,
            type: 'EVENT_REGISTRATION',
          },
        })
        .catch((err) => {
          this.logger.error(
            `Échec d'envoi de la notification organisateur EVENT_REGISTRATION après paiement=${ctx.paymentId}`,
            err,
          );
        });
    }
  }

  /**
   * Notifie l'utilisateur que sa tentative de paiement a échoué ou expiré.
   */
    notifyPaymentFailed(ctx: Omit<PaymentNotificationContext, 'organizerId' | 'participantName'>): void {
      this.notificationsService
        .sendLocalizedToUser(ctx.userId, {
          type: NotificationType.PAYMENT,
          template: 'PAYMENT_FAILED',
          eventId: ctx.eventId,
          params: {
            amount: ctx.amount,
            currency: ctx.currency,
            eventTitle: ctx.eventTitle,
          },
          data: {
            paymentId: ctx.paymentId,
            registrationId: ctx.registrationId,
            eventId: ctx.eventId,
            type: 'PAYMENT_FAILED',
          },
        })
        .catch((err) => {
          this.logger.error(
            `Échec d'envoi de la notification PAYMENT_FAILED pour payment=${ctx.paymentId}`,
            err,
          );
        });
    }
  }
