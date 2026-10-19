import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegistrationStatus } from '@prisma/client';

@Injectable()
export class CheckInService {
  private readonly logger = new Logger(CheckInService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Extracts clean 8-char ticket code from raw payload (string, JSON or URL).
   */
  extractTicketCode(raw: string): string {
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
