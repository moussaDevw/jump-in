import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventStatus, RegistrationStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class RegistrationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a unique 8-character alphanumeric ticket code.
   */
  private generateTicketCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O/0/I/1 for readability
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[crypto.randomInt(0, chars.length)];
    }
    return code;
  }

  /**
   * Registers the user for an event.
   * Uses a transactional lock (SELECT ... FOR UPDATE) to prevent overbooking.
   */
  async register(eventId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
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
      let ticketCode = this.generateTicketCode();
      let codeExists = true;
      while (codeExists) {
        const found = await tx.registration.findUnique({
          where: { ticketCode },
        });
        if (!found) {
          codeExists = false;
        } else {
          ticketCode = this.generateTicketCode();
        }
      }

      // 5. Create or reactivate the registration
      // If the event is free (price = 0), status is PAID directly
      // If paid, status is PENDING until payment is confirmed
      const status = event.price === 0 ? RegistrationStatus.PAID : RegistrationStatus.PENDING;
      let registration;

      if (existing) {
        registration = await tx.registration.update({
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
        registration = await tx.registration.create({
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

      return registration;
    }, { timeout: 15000 });
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

  /**
   * Extracts clean 8-char ticket code from raw payload (string, JSON or URL).
   */
  private extractTicketCode(raw: string): string {
    const trimmed = (raw || '').trim();
    // 1. Try JSON parsing
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.ticketCode) return String(parsed.ticketCode).trim();
        if (parsed.code) return String(parsed.code).trim();
        if (parsed.c) return String(parsed.c).trim();
      } catch {}
    }
    // 2. Check if deep link or URL (e.g. runhub://ticket/7KB9QD2A or https://runhub.app/tickets/7KB9QD2A)
    const matchUrl = trimmed.match(/(?:ticket\/|tickets\/|code=)([A-HJ-NP-Z2-9]{6,12})/i);
    if (matchUrl && matchUrl[1]) {
      return matchUrl[1];
    }
    // 3. Match 8-character alphanumeric code pattern directly
    const matchCode = trimmed.match(/[A-HJ-NP-Z2-9]{8}/i);
    if (matchCode) {
      return matchCode[0];
    }
    return trimmed;
  }

  /**
   * Toggles participant check-in status (CHECKED_IN <-> PAID).
   */
  async toggleCheckIn(eventId: string, registrationId: string, currentUserId: string) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
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
    });

    if (!registration || registration.eventId !== eventId) {
      throw new NotFoundException('Participant registration not found for this event');
    }

    if (registration.status === RegistrationStatus.CANCELLED) {
      throw new BadRequestException('Cannot check in a cancelled registration');
    }

    if (registration.status === RegistrationStatus.PENDING) {
      throw new BadRequestException('Paiement en attente : impossible de valider un billet non réglé');
    }

    const isCurrentlyCheckedIn = registration.status === RegistrationStatus.CHECKED_IN;
    const newStatus = isCurrentlyCheckedIn ? RegistrationStatus.PAID : RegistrationStatus.CHECKED_IN;
    const checkedInAt = isCurrentlyCheckedIn ? null : new Date();
    const checkedInById = isCurrentlyCheckedIn ? null : currentUserId;

    const updated = await this.prisma.registration.update({
      where: { id: registrationId },
      data: {
        status: newStatus,
        checkedInAt,
        checkedInById,
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
    });

    return updated;
  }

  /**
   * Validates a ticket scanned by QR code or ticket code string.
   */
  async scanTicket(eventId: string, rawPayload: string, currentUserId: string) {
    const cleanCode = this.extractTicketCode(rawPayload);

    // 1. Find the registration by ticketCode
    const registration = await this.prisma.registration.findFirst({
      where: {
        ticketCode: {
          equals: cleanCode,
          mode: 'insensitive',
        },
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
        event: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            price: true,
            currency: true,
            venueName: true,
          },
        },
      },
    });

    if (!registration) {
      throw new NotFoundException('Aucun billet trouvé pour ce code');
    }

    // 2. Check if ticket is for this specific event
    if (registration.eventId !== eventId) {
      throw new BadRequestException(`Ce billet correspond à un autre événement : "${registration.event.title}"`);
    }

    // 3. Check if cancelled
    if (registration.status === RegistrationStatus.CANCELLED) {
      throw new BadRequestException('Cette inscription a été annulée');
    }

    // 4. Check if pending payment
    if (registration.status === RegistrationStatus.PENDING) {
      throw new BadRequestException('Paiement en attente : ce billet n\'a pas encore été réglé');
    }

    // 5. Check if already checked in
    if (registration.status === RegistrationStatus.CHECKED_IN) {
      return {
        success: false,
        status: 'already_used',
        message: 'Ce billet a déjà été validé',
        checkedInAt: registration.checkedInAt,
        registration,
      };
    }

    // 6. Atomic check-in update to prevent race conditions on simultaneous scans
    const now = new Date();
    const updateResult = await this.prisma.registration.updateMany({
      where: {
        id: registration.id,
        status: { not: RegistrationStatus.CHECKED_IN },
      },
      data: {
        status: RegistrationStatus.CHECKED_IN,
        checkedInAt: now,
        checkedInById: currentUserId,
      },
    });

    if (updateResult.count === 0) {
      // Was checked in concurrently by another device
      const refreshed = await this.prisma.registration.findUnique({
        where: { id: registration.id },
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
          event: {
            select: {
              id: true,
              title: true,
              startsAt: true,
              price: true,
              currency: true,
              venueName: true,
            },
          },
        },
      });

      return {
        success: false,
        status: 'already_used',
        message: 'Ce billet vient d\'être validé sur un autre terminal',
        checkedInAt: refreshed?.checkedInAt || now,
        registration: refreshed || registration,
      };
    }

    // Fetch updated registration with details
    const updated = await this.prisma.registration.findUnique({
      where: { id: registration.id },
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
        event: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            price: true,
            currency: true,
            venueName: true,
          },
        },
      },
    });

    return {
      success: true,
      status: 'valid',
      message: 'Billet validé avec succès',
      registration: updated || registration,
    };
  }
}
