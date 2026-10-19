import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationType } from '@prisma/client';

@Injectable()
export class RegistrationNotificationsService {
  private readonly logger = new Logger(RegistrationNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Notifies the organizer when a new participant registers.
   */
  async notifyOrganizerOnJoin(eventId: string, userId: string): Promise<void> {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: { title: true, organizerId: true },
      });
      if (!event || event.organizerId === userId) return;

      const participant = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const participantName = participant
        ? `${participant.firstName || ''} ${participant.lastName || ''}`.trim() || 'Un participant'
        : 'Un participant';

      await this.notificationsService.sendToUser({
        userId: event.organizerId,
        actorId: userId,
        eventId,
        type: NotificationType.JOIN,
        title: 'Nouvelle inscription !',
        body: `${participantName} a rejoint votre événement « ${event.title} »`,
        data: { eventId },
      });
    } catch (err) {
      this.logger.error(`Failed to send JOIN notification for event ${eventId}`, err);
    }
  }

  /**
   * Notifies the organizer when a participant cancels their registration.
   */
  async notifyOrganizerOnLeave(eventId: string, userId: string): Promise<void> {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: { title: true, organizerId: true },
      });
      if (!event || event.organizerId === userId) return;

      const participant = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true },
      });
      const participantName = participant
        ? `${participant.firstName || ''} ${participant.lastName || ''}`.trim() || 'Un participant'
        : 'Un participant';

      await this.notificationsService.sendToUser({
        userId: event.organizerId,
        actorId: userId,
        eventId,
        type: NotificationType.JOIN,
        title: 'Désistement',
        body: `${participantName} a annulé sa participation à « ${event.title} »`,
        data: { eventId },
      });
    } catch (err) {
      this.logger.error(`Failed to send cancellation notification for event ${eventId}`, err);
    }
  }

  /**
   * Notifies users who favorited the event when a spot becomes available.
   */
  async notifyFavoritesOnSpotFree(eventId: string, cancelledUserId: string): Promise<void> {
    try {
      const event = await this.prisma.event.findUnique({
        where: { id: eventId },
        select: {
          title: true,
          capacity: true,
          favoritedBy: {
            select: { userId: true },
          },
        },
      });

      if (!event || !event.capacity || event.favoritedBy.length === 0) return;

      const targetUserIds = event.favoritedBy
        .map((f) => f.userId)
        .filter((id) => id !== cancelledUserId);

      if (targetUserIds.length > 0) {
        await this.notificationsService.sendToUsers(targetUserIds, {
          eventId,
          type: NotificationType.SPOT,
          title: 'Une place s’est libérée !',
          body: `Une place est de nouveau disponible pour « ${event.title} »`,
          data: { eventId },
        });
      }
    } catch (err) {
      this.logger.error(`Failed to send SPOT notification for event ${eventId}`, err);
    }
  }
}
