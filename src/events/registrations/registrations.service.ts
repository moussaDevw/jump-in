import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentStatus, RegistrationStatus } from '@prisma/client';
import { CodeGeneratorService } from '../../common/services/code-generator.service';
import { RegistrationNotificationsService } from './registration-notifications.service';
import { PENDING_REGISTRATION_TTL_MS } from '../../payments/payments.constants';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly notifications: RegistrationNotificationsService,
  ) { }

  /**
   * Registers the user for an event.
   * Uses a transactional lock (SELECT ... FOR UPDATE) to prevent overbooking
   * and expires stale unpaid PENDING registrations older than 20 minutes (anti-seat squatting).
   */
  async register(eventId: string, userId: string) {
    const registration = await this.prisma.$transaction(
      async (tx) => {
        // 1. Lock the event row to prevent concurrent overbooking
        const [event] = await tx.$queryRaw<any[]>`
          SELECT id, status, capacity, price
          FROM events
          WHERE id = ${eventId}::uuid
          FOR UPDATE
        `;

        if (!event) {
          throw new NotFoundException('Event not found');
        }

        if (event.status !== 'published') {
          throw new BadRequestException(
            'Cannot register for an event that is not published',
          );
        }

        // 2. Expire abandoned unpaid PENDING registrations older than 20 minutes
        if (event.price > 0) {
          const expirationCutoff = new Date(
            Date.now() - PENDING_REGISTRATION_TTL_MS,
          );
          await tx.registration.updateMany({
            where: {
              eventId,
              status: RegistrationStatus.PENDING,
              updatedAt: { lt: expirationCutoff },
              payments: {
                none: { status: PaymentStatus.SUCCESS },
              },
            },
            data: { status: RegistrationStatus.CANCELLED },
          });
        }

        // 3. Check if already registered
        const existing = await tx.registration.findFirst({
          where: {
            eventId,
            userId,
          },
          include: {
            event: {
              select: {
                id: true,
                title: true,
                startsAt: true,
                venueName: true,
                price: true,
                currency: true,
              },
            },
          },
        });

          // If the user already has an active PENDING registration for a paid event, return it idempotently so they can proceed to payment
          if (existing && existing.status === RegistrationStatus.PENDING) {
            return {
              ...existing,
              ticketCode: null,
            };
          }

          if (
            existing &&
            (existing.status === RegistrationStatus.PAID ||
              existing.status === RegistrationStatus.CHECKED_IN)
          ) {
            throw new ConflictException(
              'You are already registered for this event',
            );
          }

          // 4. Check capacity (after expiring stale PENDING holds)
          if (event.capacity) {
            const currentCount = await tx.registration.count({
              where: {
                eventId,
                status: { not: RegistrationStatus.CANCELLED },
              },
            });

            if (currentCount >= event.capacity) {
              throw new BadRequestException('This event is full');
            }
          }

          // 5. Generate unique ticket code
          let ticketCode = this.codeGenerator.generateTicketCode(8);
          let codeExists = true;
          while (codeExists) {
            const found = await tx.registration.findUnique({
              where: { ticketCode },
            });
            if (!found) {
              codeExists = false;
            } else {
              ticketCode = this.codeGenerator.generateTicketCode(8);
            }
          }

          // 6. Create or reactivate the registration
          const status =
            event.price === 0
              ? RegistrationStatus.PAID
              : RegistrationStatus.PENDING;

                const includeBlock = {
                  event: {
                    select: {
                      id: true,
                      title: true,
                      startsAt: true,
                      venueName: true,
                      price: true,
                      currency: true,
                    },
                      },
                    };

                    const reg = existing
                      ? await tx.registration.update({
                        where: { id: existing.id },
                        data: {
                          status,
                          ticketCode,
                          checkedInAt: null,
                          checkedInById: null,
                        },
                  include: includeBlock,
                })
          : await tx.registration.create({
                  data: {
                    eventId,
                    userId,
                    ticketCode,
                    status,
                  },
include: includeBlock,
            });

return status === RegistrationStatus.PAID
  ? reg
  : { ...reg, ticketCode: null };
      },
{ timeout: 15000 },
    );

// Notify organizer immediately ONLY for free events (PAID).
// For paid events (PENDING), PaymentSettlementService notifies the organizer once payment succeeds.
if (registration.status === RegistrationStatus.PAID) {
  this.notifications.notifyOrganizerOnJoin(eventId, userId).catch((err) => {
    this.logger.error(
      `Failed to send JOIN notification for event ${eventId}`,
      err,
    );
  });
}

return registration;
  }

  /**
   * Cancels the user's registration for an event.
   */
  async cancel(eventId: string, userId: string) {
  const registration = await this.prisma.registration.findFirst({
    where: {
      eventId,
      userId,
      status: { not: RegistrationStatus.CANCELLED },
    },
    include: {
      event: {
        select: {
          price: true,
        },
      },
    },
  });

  if (!registration) {
    throw new NotFoundException(
      'No active registration found for this event',
    );
  }

  if (registration.status === RegistrationStatus.CHECKED_IN) {
    throw new BadRequestException(
      'Cannot cancel a registration that has been checked in',
    );
  }

  // Protect paid tickets from accidental unrefunded self-cancellation
  if (
    registration.status === RegistrationStatus.PAID &&
    registration.event.price > 0
  ) {
    throw new BadRequestException(
      'Ce billet payant a déjà été réglé. Veuillez contacter l’organisateur pour toute demande d’annulation ou de remboursement.',
    );
  }

  const wasConfirmedPaid = registration.status === RegistrationStatus.PAID;

  await this.prisma.$transaction([
    this.prisma.registration.update({
      where: { id: registration.id },
      data: { status: RegistrationStatus.CANCELLED },
    }),
    this.prisma.payment.updateMany({
      where: {
        registrationId: registration.id,
        status: PaymentStatus.PENDING,
      },
      data: { status: PaymentStatus.FAILED },
    }),
  ]);

  if (wasConfirmedPaid) {
    this.notifications
      .notifyOrganizerOnLeave(eventId, userId)
      .catch((err) => {
        this.logger.error(
          `Failed to send cancellation notification for event ${eventId}`,
          err,
        );
      });
  }

  this.notifications
    .notifyFavoritesOnSpotFree(eventId, userId)
    .catch((err) => {
      this.logger.error(
        `Failed to send SPOT notification for event ${eventId}`,
        err,
      );
    });

  return { success: true };
}

  /**
   * Returns the list of confirmed or pending participants for an event.
   */
  async getEventParticipants(eventId: string) {
  const event = await this.prisma.event.findUnique({ where: { id: eventId } });
  if (!event) {
    throw new NotFoundException('Event not found');
  }

    const participants = await this.prisma.registration.findMany({
      where: {
        eventId,
        status: { not: RegistrationStatus.CANCELLED },
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return participants.map((p) =>
      p.status === RegistrationStatus.PENDING ? { ...p, ticketCode: null } : p,
    );
  }

  /**
   * Returns the user's registrations (for agenda).
   * Hides ticketCode while registration is still PENDING payment.
   */
  async getMyRegistrations(userId: string, type ?: 'upcoming' | 'past') {
    const now = new Date();

    const eventCondition =
      type === 'upcoming'
        ? {
          OR: [
            { endsAt: { gte: now } },
            {
              AND: [
                { endsAt: null },
                {
                  startsAt: {
                    gte: new Date(now.getTime() - 2 * 60 * 60 * 1000),
                  },
                },
              ],
            },
          ],
        }
        : type === 'past'
          ? {
            OR: [
              { endsAt: { lt: now } },
              {
                AND: [
                  { endsAt: null },
                  {
                    startsAt: {
                      lt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
                    },
                  },
                ],
              },
            ],
          }
          : undefined;

      const registrations = await this.prisma.registration.findMany({
        where: {
          userId,
          status: { not: RegistrationStatus.CANCELLED },
          ...(eventCondition ? { event: eventCondition } : {}),
        },
        include: {
          event: {
            include: {
              sport: true,
              organizer: {
                select: {
                  id: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                  avatarUrl: true,
                },
              },
              _count: {
                select: {
                  registrations: true,
                },
              },
            },
          },
        },
        orderBy: { event: { startsAt: type === 'past' ? 'desc' : 'asc' } },
      });

      return registrations.map((reg) =>
        reg.status === RegistrationStatus.PENDING
          ? { ...reg, ticketCode: null }
          : reg,
      );
    }

  /**
   * Checks if a user is registered for a specific event.
   */
  async getRegistrationStatus(eventId: string, userId: string) {
      const registration = await this.prisma.registration.findFirst({
        where: {
          eventId,
          userId,
          status: { not: RegistrationStatus.CANCELLED },
        },
        select: {
          id: true,
          ticketCode: true,
          status: true,
          createdAt: true,
        },
      });

      if(!registration) {
        return {
          isRegistered: false,
          registration: null,
        };
      }

    const isPaid =
        registration.status === RegistrationStatus.PAID ||
        registration.status === RegistrationStatus.CHECKED_IN;

      return {
        isRegistered: isPaid,
        isPendingPayment: registration.status === RegistrationStatus.PENDING,
        registration: isPaid
          ? registration
          : { ...registration, ticketCode: null },
      };
    }
}
