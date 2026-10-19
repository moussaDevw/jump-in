import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegistrationStatus } from '@prisma/client';
import { CodeGeneratorService } from '../../common/services/code-generator.service';
import { RegistrationNotificationsService } from './registration-notifications.service';

@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly codeGenerator: CodeGeneratorService,
    private readonly notifications: RegistrationNotificationsService,
  ) {}

  /**
   * Registers the user for an event.
   * Uses a transactional lock (SELECT ... FOR UPDATE) to prevent overbooking.
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
          throw new BadRequestException('Cannot register for an event that is not published');
        }

        // 2. Check if already registered
        const existing = await tx.registration.findFirst({
          where: {
            eventId,
            userId,
          },
        });

        if (existing && existing.status !== RegistrationStatus.CANCELLED) {
          throw new ConflictException('You are already registered for this event');
        }

        // 3. Check capacity
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

        // 4. Generate unique ticket code
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

        // 5. Create or reactivate the registration
        const status = event.price === 0 ? RegistrationStatus.PAID : RegistrationStatus.PENDING;
        let reg;

        if (existing) {
          reg = await tx.registration.update({
            where: { id: existing.id },
            data: {
              status,
              ticketCode,
              checkedInAt: null,
              checkedInById: null,
            },
            include: {
              event: {
                select: {
                  id: true,
                  title: true,
                  startsAt: true,
                  venueName: true,
                },
              },
            },
          });
        } else {
          reg = await tx.registration.create({
            data: {
              eventId,
              userId,
              ticketCode,
              status,
            },
            include: {
              event: {
                select: {
                  id: true,
                  title: true,
                  startsAt: true,
                  venueName: true,
                },
              },
            },
          });
        }

        return reg;
      },
      { timeout: 15000 },
    );

    // Asynchronously notify event organizer
    this.notifications.notifyOrganizerOnJoin(eventId, userId).catch((err) => {
      this.logger.error(`Failed to send JOIN notification for event ${eventId}`, err);
    });

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
    });

    if (!registration) {
      throw new NotFoundException('No active registration found for this event');
    }

    if (registration.status === RegistrationStatus.CHECKED_IN) {
      throw new BadRequestException('Cannot cancel a registration that has been checked in');
    }

    await this.prisma.registration.update({
      where: { id: registration.id },
      data: { status: RegistrationStatus.CANCELLED },
    });

    // Notify organizer of cancellation
    this.notifications.notifyOrganizerOnLeave(eventId, userId).catch((err) => {
      this.logger.error(`Failed to send cancellation notification for event ${eventId}`, err);
    });

    // Notify users who favorited the event if spots opened up
    this.notifications.notifyFavoritesOnSpotFree(eventId, userId).catch((err) => {
      this.logger.error(`Failed to send SPOT notification for event ${eventId}`, err);
    });

    return { success: true };
  }

  /**
   * Returns the list of participants for an event.
   */
  async getEventParticipants(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.prisma.registration.findMany({
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
  }

  /**
   * Returns the user's registrations (for agenda).
   * Supports filtering by type ('upcoming' | 'past').
   */
  async getMyRegistrations(userId: string, type?: 'upcoming' | 'past') {
    const now = new Date();

    const eventCondition =
      type === 'upcoming'
        ? {
            OR: [
              { endsAt: { gte: now } },
              {
                AND: [
                  { endsAt: null },
                  { startsAt: { gte: new Date(now.getTime() - 2 * 60 * 60 * 1000) } },
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
                    { startsAt: { lt: new Date(now.getTime() - 2 * 60 * 60 * 1000) } },
                  ],
                },
              ],
            }
          : undefined;

    return this.prisma.registration.findMany({
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

    return {
      isRegistered: !!registration,
      registration: registration || null,
    };
  }
}
