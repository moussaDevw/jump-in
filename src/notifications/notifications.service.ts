import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationType, Notification } from '@prisma/client';
import { ExpoPushMessage } from 'expo-server-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from './devices.service';
import { PushNotificationService } from './push-notification.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import {
  formatNotification,
  normalizeLocale,
  NotificationTemplateKey,
  NotificationTemplateParams,
  SupportedLocale,
} from './notifications.i18n';

export interface SendNotificationParams {
  userId: string;
  type: NotificationType;
  title: string | { fr: string; en: string };
  body: string | { fr: string; en: string };
  actorId?: string;
  eventId?: string;
  data?: Record<string, any>;
}

export interface SendLocalizedNotificationParams {
  type: NotificationType;
  template: NotificationTemplateKey;
  params?: NotificationTemplateParams;
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
   * Sends a localized notification to a single user using pre-defined templates.
   */
  async sendLocalizedToUser(
    userId: string,
    params: SendLocalizedNotificationParams,
  ): Promise<Notification | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notifEnabled: true, locale: true },
    });

    if (!user) {
      this.logger.warn(`User ${userId} not found when sending notification`);
      return null;
    }

    const { title, body } = formatNotification(params.template, params.params, user.locale);

    return this.sendToUser({
      userId,
      type: params.type,
      title,
      body,
      actorId: params.actorId,
      eventId: params.eventId,
      data: {
        ...(params.data || {}),
        template: params.template,
        templateParams: params.params,
      },
    });
  }

  /**
   * Sends localized notifications to multiple users in bulk, formatting each user's
   * message in their respective preferred language (fr/en).
   */
  async sendLocalizedToUsers(
    userIds: string[],
    params: SendLocalizedNotificationParams,
  ): Promise<void> {
    if (!userIds.length) return;

    const uniqueUserIds = Array.from(new Set(userIds));

    // Fetch user preferences and locales
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, notifEnabled: true, locale: true },
    });

    if (!users.length) return;

    const usersByLocale = new Map<SupportedLocale, string[]>();
    const enabledUsersByLocale = new Map<SupportedLocale, string[]>();

    for (const u of users) {
      const loc = normalizeLocale(u.locale);
      if (!usersByLocale.has(loc)) {
        usersByLocale.set(loc, []);
        enabledUsersByLocale.set(loc, []);
      }
      usersByLocale.get(loc)!.push(u.id);
      if (u.notifEnabled) {
        enabledUsersByLocale.get(loc)!.push(u.id);
      }
    }

    // For each locale, persist in-app notifications and send push messages
    for (const [locale, targetIds] of usersByLocale.entries()) {
      if (!targetIds.length) continue;

      const { title, body } = formatNotification(params.template, params.params, locale);

      await this.prisma.notification.createMany({
        data: targetIds.map((userId) => ({
          userId,
          type: params.type,
          body,
          actorId: params.actorId,
          eventId: params.eventId,
        })),
      });

      const pushTargetIds = enabledUsersByLocale.get(locale) || [];
      if (!pushTargetIds.length) continue;

      const devices = await this.devicesService.getActiveDevicesForUsers(pushTargetIds);
      if (!devices.length) continue;

      const channelId = this.resolveChannelId(params.type);
      const messages: ExpoPushMessage[] = devices.map((d) => ({
        to: d.pushToken,
        sound: 'default',
        title,
        body,
        channelId,
        data: {
          ...(params.data || {}),
          template: params.template,
          templateParams: params.params,
          type: params.type,
          eventId: params.eventId,
        },
      }));

      this.pushNotificationService.sendPushNotifications(messages).catch((err) => {
        this.logger.error(`Failed to send bulk push notifications for locale ${locale}`, err);
      });
    }
  }

  /**
   * Creates an in-app notification in DB and sends a push notification to all active devices of a user.
   */
  async sendToUser(params: SendNotificationParams): Promise<Notification> {
    const { userId, type, title, body, actorId, eventId, data = {} } = params;

    // 1. Fetch user to check global notification preferences and preferred locale
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { notifEnabled: true, locale: true },
    });

    const userLocale = normalizeLocale(user?.locale);
    const resolvedTitle =
      typeof title === 'object' ? title[userLocale] || title.fr || '' : title;
    const resolvedBody =
      typeof body === 'object' ? body[userLocale] || body.fr || '' : body;

    // 2. Persist in-app notification in DB
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        body: resolvedBody,
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
      title: resolvedTitle,
      body: resolvedBody,
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

    // 1. Fetch user notification preferences and locales
    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, notifEnabled: true, locale: true },
    });
    const userLocaleMap = new Map<string, SupportedLocale>(
      users.map((u) => [u.id, normalizeLocale(u.locale)]),
    );
    const enabledUserIds = new Set(
      users.filter((u) => u.notifEnabled).map((u) => u.id),
    );

    const resolveField = (
      val: string | { fr: string; en: string },
      locale: SupportedLocale,
    ): string => (typeof val === 'object' ? val[locale] || val.fr || '' : val);

    // 2. Batch create in-app notifications
    await this.prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => {
        const userLoc = userLocaleMap.get(userId) || 'fr';
        return {
          userId,
          type: params.type,
          body: resolveField(params.body, userLoc),
          actorId: params.actorId,
          eventId: params.eventId,
        };
      }),
    });

    // 3. Fetch active devices for enabled users
    const targetUserIds = Array.from(enabledUserIds);
    if (!targetUserIds.length) return;

    const devices = await this.devicesService.getActiveDevicesForUsers(targetUserIds);
    if (!devices.length) return;

    // 4. Construct push messages
    const channelId = this.resolveChannelId(params.type);
    const messages: ExpoPushMessage[] = devices.map((d) => {
      const userLoc = userLocaleMap.get(d.userId) || 'fr';
      return {
        to: d.pushToken,
        sound: 'default',
        title: resolveField(params.title, userLoc),
        body: resolveField(params.body, userLoc),
        channelId,
        data: {
          ...(params.data || {}),
          type: params.type,
          eventId: params.eventId,
        },
      };
    });

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
