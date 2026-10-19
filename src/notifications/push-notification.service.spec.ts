import { Test, TestingModule } from '@nestjs/testing';
import { PushNotificationService } from './push-notification.service';
import { DevicesService } from './devices.service';

jest.mock('expo-server-sdk', () => {
  return {
    Expo: class MockExpo {
      static isExpoPushToken(token: string) {
        return typeof token === 'string' && token.startsWith('ExponentPushToken[');
      }
      chunkPushNotifications(msgs: any[]) {
        return [msgs];
      }
      sendPushNotificationsAsync(chunk: any[]) {
        return Promise.resolve(
          chunk.map((msg) => {
            if (msg.to === 'ExponentPushToken[unregistered]') {
              return { status: 'error', message: 'Device not registered', details: { error: 'DeviceNotRegistered' } };
            }
            return { status: 'ok', id: 'ticket-1' };
          }),
        );
      }
    },
  };
});

describe('PushNotificationService', () => {
  let service: PushNotificationService;
  let devicesService: { markTokensAsRevoked: jest.Mock };

  beforeEach(async () => {
    devicesService = {
      markTokensAsRevoked: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushNotificationService,
        {
          provide: DevicesService,
          useValue: devicesService,
        },
      ],
    }).compile();

    service = module.get<PushNotificationService>(PushNotificationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return empty array when no messages provided', async () => {
    const result = await service.sendPushNotifications([]);
    expect(result).toEqual([]);
  });

  it('should filter invalid tokens and send valid push notifications', async () => {
    const messages = [
      { to: 'ExponentPushToken[valid1]', title: 'Test 1', body: 'Body 1' },
      { to: 'invalid-token-123', title: 'Test 2', body: 'Body 2' },
    ];

    const tickets = await service.sendPushNotifications(messages);

    expect(devicesService.markTokensAsRevoked).toHaveBeenCalledWith(['invalid-token-123']);
    expect(tickets.length).toBe(1);
    expect(tickets[0]).toEqual({ status: 'ok', id: 'ticket-1' });
  });

  it('should revoke token when ticket status is DeviceNotRegistered', async () => {
    const messages = [
      { to: 'ExponentPushToken[unregistered]', title: 'Test', body: 'Body' },
    ];

    const tickets = await service.sendPushNotifications(messages);

    expect(tickets[0].status).toBe('error');
    expect(devicesService.markTokensAsRevoked).toHaveBeenCalledWith(['ExponentPushToken[unregistered]']);
  });
});
