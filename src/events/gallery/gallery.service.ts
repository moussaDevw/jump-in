import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GalleryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves all gallery photos for an event.
   */
  async getGallery(eventId: string) {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return this.prisma.eventGallery.findMany({
      where: { eventId },
      orderBy: { position: 'asc' },
    });
  }

  /**
   * Adds a photo to an event's gallery.
   */
  async addPhoto(eventId: string, url: string) {
    // Note: Event existence and authorization are pre-validated by the EventOrganizerGuard

    // Calculate next position (count of existing photos)
    const position = await this.prisma.eventGallery.count({
      where: { eventId },
    });

    return this.prisma.eventGallery.create({
      data: {
        eventId,
        url,
        position,
      },
    });
  }

  /**
   * Deletes a photo from the gallery.
   */
  async deletePhoto(eventId: string, photoId: string) {
    // Note: Event existence and authorization are pre-validated by the EventOrganizerGuard

    const photo = await this.prisma.eventGallery.findUnique({
      where: { id: photoId },
    });

    if (!photo || photo.eventId !== eventId) {
      throw new NotFoundException('Photo not found in this event gallery');
    }

    await this.prisma.eventGallery.delete({
      where: { id: photoId },
    });

    return { success: true };
  }

  /**
   * Reorders photos in an event's gallery.
   */
  async reorderGallery(eventId: string, photoIds: string[]) {
    // Note: Event existence and authorization are pre-validated by the EventOrganizerGuard

    // Validate that all sent photo IDs actually belong to this event's gallery
    const existingPhotos = await this.prisma.eventGallery.findMany({
      where: {
        id: { in: photoIds },
        eventId,
      },
    });

    if (existingPhotos.length !== photoIds.length) {
      throw new BadRequestException('One or more photo IDs are invalid or do not belong to this event');
    }

    // Update positions sequentially in a transaction
    return this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < photoIds.length; i++) {
        await tx.eventGallery.update({
          where: { id: photoIds[i] },
          data: { position: i },
        });
      }

      return tx.eventGallery.findMany({
        where: { eventId },
        orderBy: { position: 'asc' },
      });
    });
  }
}
