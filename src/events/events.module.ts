import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { GalleryService } from './gallery/gallery.service';
import { GalleryController } from './gallery/gallery.controller';
import { InteractionsService } from './interactions/interactions.service';
import { LikesController } from './interactions/likes.controller';
import { FavoritesController } from './interactions/favorites.controller';
import { RegistrationsService } from './registrations/registrations.service';
import { RegistrationsController } from './registrations/registrations.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    GalleryController,
    LikesController,
    FavoritesController,
    RegistrationsController,
    EventsController,
  ],
  providers: [
    EventsService,
    GalleryService,
    InteractionsService,
    RegistrationsService,
  ],
  exports: [
    EventsService,
    GalleryService,
    InteractionsService,
    RegistrationsService,
  ],
})
export class EventsModule {}
