import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InteractionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Likes an event.
   */
  async like(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const likeExists = await this.prisma.like.findUnique({
      where: {
        userId_eventId: { userId, eventId },
      },
    });

    if (likeExists) {
      return { success: true, message: 'Already liked' };
    }

    await this.prisma.like.create({
      data: {
        userId,
        eventId,
      },
    });

    return { success: true };
  }

  /**
   * Unlikes an event.
   */
  async unlike(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const likeExists = await this.prisma.like.findUnique({
      where: {
        userId_eventId: { userId, eventId },
      },
    });

    if (!likeExists) {
      return { success: true, message: 'Not liked yet' };
    }

    await this.prisma.like.delete({
      where: {
        userId_eventId: { userId, eventId },
      },
    });

    return { success: true };
  }

  /**
   * Favorites an event.
   */
  async favorite(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const favExists = await this.prisma.favorite.findUnique({
      where: {
        userId_eventId: { userId, eventId },
      },
    });

    if (favExists) {
      return { success: true, message: 'Already favorited' };
    }

    await this.prisma.favorite.create({
      data: {
        userId,
        eventId,
      },
    });

    return { success: true };
  }

  /**
   * Unfavorites an event.
   */
  async unfavorite(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const favExists = await this.prisma.favorite.findUnique({
      where: {
        userId_eventId: { userId, eventId },
      },
    });

    if (!favExists) {
      return { success: true, message: 'Not favorited yet' };
    }

    await this.prisma.favorite.delete({
      where: {
        userId_eventId: { userId, eventId },
      },
    });

    return { success: true };
  }

  /**
   * Returns all events favorited by the user.
   */
  async getUserFavorites(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
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
                likes: true,
                favoritedBy: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return favorites.map((f) => ({
      ...f.event,
      favoritedAt: f.createdAt,
    }));
  }

  /**
   * Returns a Set of event IDs that the user has favorited.
   * Used to quickly check favorite status on a list of events.
   */
  async getUserFavoriteIds(userId: string): Promise<string[]> {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId },
      select: { eventId: true },
    });
    return favorites.map((f) => f.eventId);
  }
}
