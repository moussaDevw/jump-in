import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Notification } from '@prisma/client';
import { ExpoPushMessage } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from './devices.service';
import { PushNotificationService } from './push-notification.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

export interface SendNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  actorId?: string;
  eventId?: string;
  data?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly devicesService: DevicesService,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  /**
   * Resolves the Android notification channel according to the notification type.
   */
  private resolveChannelId(type: NotificationType): string {
    switch (type) {
      case NotificationType.MESSAGE:
        return 'messages';
      case NotificationType.PAYMENT:
        return 'payments';
      case NotificationType.REMINDER:
      case NotificationType.JOIN:
      case NotificationType.SPOT:
        return 'events';
      default:
        return 'default';
    }
  }

  /**
   * Creates an in-app notification in DB and sends a push notification to all active devices of a user.
   */
  async sendToUser(params: SendNotificationParams): Promise<Notification> {
    const { userId, type, title, body, actorId, eventId, data = {} } = params;

    // 1. Fetch user to check global notification preferences
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notifEnabled: true },
    });

    // 2. Persist in-app notification in DB
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        body,
        actorId,
        eventId,
      },
    });

    // 3. If notifications are disabled globally by user, skip push delivery
    if (!user || !user.notifEnabled) {
      this.logger.debug(`Push skipped: notifEnabled=false for user ${userId}`);
      return notification;
    }

    // 4. Retrieve active user push tokens
    const devices = await this.devicesService.getActiveDevicesForUser(userId);
    if (!devices.length) {
      return notification;
    }

    // 5. Construct Expo Push Messages
    const channelId = this.resolveChannelId(type);
    const messages: ExpoPushMessage[] = devices.map((d) => ({
      to: d.pushToken,
      sound: 'default',
      title,
      body,
      channelId,
      data: {
        ...data,
        notificationId: notification.id,
        type,
        eventId,
      },
    }));

    // 6. Send push notifications asynchronously
    this.pushNotificationService.sendPushNotifications(messages).catch((err) => {
      this.logger.error(`Failed to send push notification to user ${userId}`, err);
    });

    return notification;
  }

  /**
   * Sends notifications to multiple users in bulk (e.g., event participants).
   */
  async sendToUsers(
    userIds: string[],
    params: Omit<SendNotificationParams, 'userId'>,
  ): Promise<void> {
    if (!userIds.length) return;

    // Unique user IDs
    const uniqueUserIds = Array.from(new Set(userIds));

    // 1. Fetch user notification preferences
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, notifEnabled: true },
    });
    const enabledUserIds = new Set(
      users.filter((u) => u.notifEnabled).map((u) => u.id),
    );

    // 2. Batch create in-app notifications
    await this.prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        userId,
        type: params.type,
        body: params.body,
        actorId: params.actorId,
        eventId: params.eventId,
      })),
    });

    // 3. Fetch active devices for enabled users
    const targetUserIds = Array.from(enabledUserIds);
    if (!targetUserIds.length) return;

    const devices = await this.devicesService.getActiveDevicesForUsers(targetUserIds);
    if (!devices.length) return;

    // 4. Construct push messages
    const channelId = this.resolveChannelId(params.type);
    const messages: ExpoPushMessage[] = devices.map((d) => ({
      to: d.pushToken,
      sound: 'default',
      title: params.title,
      body: params.body,
      channelId,
      data: {
        ...(params.data || {}),
        type: params.type,
        eventId: params.eventId,
      },
    }));

    // 5. Send push notifications
    this.pushNotificationService.sendPushNotifications(messages).catch((err) => {
      this.logger.error('Failed to send bulk push notifications', err);
    });
  }

  /**
   * Retrieves paginated notifications for the logged-in user.
   */
  async getUserNotifications(userId: string, query: NotificationQueryDto) {
    const { limit = 20, cursor, unreadOnly } = query;

    const where: any = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const notifications = await this.prisma.notification.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        actor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        event: {
          select: {
            id: true,
            title: true,
            coverUrl: true,
            startsAt: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    if (notifications.length > limit) {
      const nextItem = notifications.pop();
      nextCursor = nextItem?.id || null;
    }

    return {
      notifications,
      nextCursor,
    };
  }

  /**
   * Gets the unread notifications count for badge display.
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        readAt: null,
      },
    });
  }

  /**
   * Marks a specific notification as read.
   */
  async markAsRead(userId: string, notificationId: string): Promise<Notification> {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
    });
  }

  /**
   * Marks all unread notifications of the user as read.
   */
  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });

    return { count: result.count };
  }
}
