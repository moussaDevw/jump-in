import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { DevicesService } from './devices.service';
import { PushNotificationService } from './push-notification.service';
import { NotificationType } from '@prisma/client';

jest.mock('expo-server-sdk', () => {
  return {
    Expo: class MockExpo {
      static isExpoPushToken() {
        return true;
      }
      chunkPushNotifications(msgs: any[]) {
        return [msgs];
      }
      sendPushNotificationsAsync() {
        return Promise.resolve([]);
      }
    },
  };
});

describe('NotificationsService', () => {
  let service: NotificationsService;
  let prisma: any;
  let devicesService: { getActiveDevicesForUser: jest.Mock; getActiveDevicesForUsers: jest.Mock };
  let pushNotificationService: { sendPushNotifications: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      notification: {
        create: jest.fn(),
        createMany: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    devicesService = {
      getActiveDevicesForUser: jest.fn(),
      getActiveDevicesForUsers: jest.fn(),
    };

    pushNotificationService = {
      sendPushNotifications: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: DevicesService,
          useValue: devicesService,
        },
        {
          provide: PushNotificationService,
          useValue: pushNotificationService,
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create in-app notification and send push notification when user has notifEnabled', async () => {
    prisma.user.findUnique.mockResolvedValue({ notifEnabled: true });
    prisma.notification.create.mockResolvedValue({
      id: 'notif-1',
      userId: 'user-1',
      type: NotificationType.JOIN,
      body: 'User joined your event',
    });
    devicesService.getActiveDevicesForUser.mockResolvedValue([
      { pushToken: 'ExponentPushToken[xyz]' },
    ]);

    const result = await service.sendToUser({
      userId: 'user-1',
      type: NotificationType.JOIN,
      title: 'New Member',
      body: 'User joined your event',
      eventId: 'event-1',
    });

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: NotificationType.JOIN,
        body: 'User joined your event',
        actorId: undefined,
        eventId: 'event-1',
      },
    });
    expect(devicesService.getActiveDevicesForUser).toHaveBeenCalledWith('user-1');
    expect(pushNotificationService.sendPushNotifications).toHaveBeenCalledWith([
      expect.objectContaining({
        to: 'ExponentPushToken[xyz]',
        title: 'New Member',
        body: 'User joined your event',
        channelId: 'events',
      }),
    ]);
    expect(result.id).toBe('notif-1');
  });

  it('should not send push if notifEnabled is false, but still persist in-app notification', async () => {
    prisma.user.findUnique.mockResolvedValue({ notifEnabled: false });
    prisma.notification.create.mockResolvedValue({
      id: 'notif-2',
      userId: 'user-2',
      type: NotificationType.MESSAGE,
      body: 'Hello',
    });

    const result = await service.sendToUser({
      userId: 'user-2',
      type: NotificationType.MESSAGE,
      title: 'New Message',
      body: 'Hello',
    });

    expect(prisma.notification.create).toHaveBeenCalled();
    expect(devicesService.getActiveDevicesForUser).not.toHaveBeenCalled();
    expect(pushNotificationService.sendPushNotifications).not.toHaveBeenCalled();
    expect(result.id).toBe('notif-2');
  });

  it('should mark all notifications as read', async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 5 });

    const result = await service.markAllAsRead('user-1');

    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        readAt: null,
      },
      data: {
        readAt: expect.any(Date),
      },
    });
    expect(result.count).toBe(5);
  });
});
