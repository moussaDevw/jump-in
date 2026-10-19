import { Test, TestingModule } from '@nestjs/testing';
import { DevicesService } from './devices.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformType } from '@prisma/client';

describe('DevicesService', () => {
  let service: DevicesService;
  let prisma: { device: { upsert: jest.Mock; updateMany: jest.Mock; findMany: jest.Mock } };

  beforeEach(async () => {
    prisma = {
      device: {
        upsert: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should register or update a device token', async () => {
    const mockDevice = {
      id: 'dev-1',
      userId: 'user-1',
      pushToken: 'ExponentPushToken[abc]',
      platform: PlatformType.IOS,
      revokedAt: null,
      lastSeenAt: new Date(),
    };
    prisma.device.upsert.mockResolvedValue(mockDevice);

    const result = await service.registerDevice('user-1', {
      pushToken: 'ExponentPushToken[abc]',
      platform: PlatformType.IOS,
    });

    expect(prisma.device.upsert).toHaveBeenCalledWith({
      where: { pushToken: 'ExponentPushToken[abc]' },
      update: {
        userId: 'user-1',
        platform: PlatformType.IOS,
        revokedAt: null,
        lastSeenAt: expect.any(Date),
      },
      create: {
        userId: 'user-1',
        pushToken: 'ExponentPushToken[abc]',
        platform: PlatformType.IOS,
        revokedAt: null,
        lastSeenAt: expect.any(Date),
      },
    });
    expect(result).toEqual(mockDevice);
  });

  it('should revoke device token', async () => {
    prisma.device.updateMany.mockResolvedValue({ count: 1 });

    await service.revokeDevice('user-1', 'ExponentPushToken[abc]');

    expect(prisma.device.updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        pushToken: 'ExponentPushToken[abc]',
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });
  });

  it('should return active devices for a user', async () => {
    const mockDevices = [{ id: 'dev-1', pushToken: 'ExponentPushToken[abc]' }];
    prisma.device.findMany.mockResolvedValue(mockDevices);

    const result = await service.getActiveDevicesForUser('user-1');

    expect(prisma.device.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        revokedAt: null,
      },
    });
    expect(result).toEqual(mockDevices);
  });
});
