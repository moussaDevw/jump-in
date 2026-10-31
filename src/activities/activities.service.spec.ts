import { Test, TestingModule } from '@nestjs/testing';
import { ActivitiesService } from './activities.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivitySource, ActivityVisibility } from '@prisma/client';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ActivitiesService', () => {
  let service: ActivitiesService;
  let prisma: {
    activity: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      aggregate: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      activity: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        aggregate: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<ActivitiesService>(ActivitiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should return existing activity if externalId matches (idempotency)', async () => {
      const existingActivity = {
        id: 'act-1',
        title: 'Morning Run',
        externalId: 'hk-12345',
      };
      prisma.activity.findUnique.mockResolvedValue(existingActivity);

      const result = await service.create('user-1', {
        title: 'Morning Run',
        externalId: 'hk-12345',
        startedAt: '2026-10-19T08:00:00Z',
        endedAt: '2026-10-19T08:30:00Z',
        durationSeconds: 1800,
        distanceMeters: 5000,
      });

      expect(result).toEqual(existingActivity);
      expect(prisma.activity.create).not.toHaveBeenCalled();
    });

    it('should create and return a new activity', async () => {
      prisma.activity.create.mockResolvedValue({
        id: 'act-2',
        userId: 'user-1',
        title: 'Course RunHub',
        distanceKm: 5,
        avgPaceSecPerKm: 360,
      });

      const result = await service.create('user-1', {
        startedAt: '2026-10-19T08:00:00Z',
        endedAt: '2026-10-19T08:30:00Z',
        durationSeconds: 1800,
        distanceMeters: 5000,
        source: ActivitySource.IN_APP_TRACKER,
      });

      expect(prisma.activity.create).toHaveBeenCalled();
      expect(result.id).toBe('act-2');
    });
  });

  describe('findMyActivities', () => {
    it('should return paginated activities', async () => {
      const mockActivities = [
        { id: 'act-1', title: 'Run 1' },
        { id: 'act-2', title: 'Run 2' },
      ];
      prisma.activity.findMany.mockResolvedValue(mockActivities);

      const result = await service.findMyActivities('user-1', { limit: 10 });
      expect(result.activities).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe('getUserStats', () => {
    it('should calculate total, weekly and monthly distance stats', async () => {
      prisma.activity.aggregate
        .mockResolvedValueOnce({
          _count: { id: 10 },
          _sum: { distanceKm: 75.5, durationSeconds: 27000, caloriesBurned: 4500 },
        })
        .mockResolvedValueOnce({
          _sum: { distanceKm: 18.2 },
        })
        .mockResolvedValueOnce({
          _sum: { distanceKm: 45.0 },
        });

      const stats = await service.getUserStats('user-1');
      expect(stats.totalActivities).toBe(10);
      expect(stats.totalDistanceKm).toBe(75.5);
      expect(stats.weeklyDistanceKm).toBe(18.2);
      expect(stats.monthlyDistanceKm).toBe(45.0);
    });
  });

  describe('findById', () => {
    it('should throw NotFoundException if activity does not exist', async () => {
      prisma.activity.findFirst.mockResolvedValue(null);

      await expect(service.findById('non-existent', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if activity is private and user is not owner', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        id: 'act-1',
        userId: 'owner-id',
        visibility: ActivityVisibility.PRIVATE,
      });

      await expect(service.findById('act-1', 'other-user')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return activity if user is owner', async () => {
      const mockActivity = {
        id: 'act-1',
        userId: 'user-1',
        visibility: ActivityVisibility.PRIVATE,
      };
      prisma.activity.findFirst.mockResolvedValue(mockActivity);

      const result = await service.findById('act-1', 'user-1');
      expect(result).toEqual(mockActivity);
    });
  });

  describe('update and delete', () => {
    it('should forbid non-owner from updating', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        id: 'act-1',
        userId: 'owner-id',
      });

      await expect(
        service.update('act-1', 'intruder-id', { title: 'Hacked' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should soft delete activity for owner', async () => {
      prisma.activity.findFirst.mockResolvedValue({
        id: 'act-1',
        userId: 'user-1',
      });
      prisma.activity.update.mockResolvedValue({ id: 'act-1' });

      const result = await service.delete('act-1', 'user-1');
      expect(result.success).toBe(true);
      expect(prisma.activity.update).toHaveBeenCalledWith({
        where: { id: 'act-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });
});
