import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushNotificationService } from './push-notification.service';

@Module({
  imports: [PrismaModule],
  controllers: [DevicesController, NotificationsController],
  providers: [DevicesService, PushNotificationService, NotificationsService],
  exports: [NotificationsService, DevicesService, PushNotificationService],
})
export class NotificationsModule {}
