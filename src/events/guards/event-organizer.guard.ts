import { CanActivate, ExecutionContext, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClubRole } from '@prisma/client';

@Injectable()
export class EventOrganizerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const eventId = request.params.id || request.params.eventId;

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    if (!eventId) {
      throw new NotFoundException('Event ID not found in request parameters');
    }

    // 1. Fetch the event
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    // 2. Platform Admins bypass authorization checks
    if (user.isAdmin) {
      request.event = event;
      return true;
    }

    // 3. Event Organizer is authorized
    if (event.organizerId === user.id) {
      request.event = event;
      return true;
    }

    // 4. Club Owner or Admin of the linked club is authorized
    if (event.clubId) {
      const member = await this.prisma.clubMember.findUnique({
        where: {
          clubId_userId: { clubId: event.clubId, userId: user.id },
        },
      });

      if (member && (member.role === ClubRole.ADMIN || member.role === ClubRole.OWNER)) {
        request.event = event;
        return true;
      }
    }

    throw new ForbiddenException('You are not authorized to perform this action on this event');
  }
}
