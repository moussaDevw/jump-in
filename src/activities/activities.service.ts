import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { QueryActivitiesDto } from './dto/query-activities.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { ActivitySource, ActivityVisibility } from '@prisma/client';

@Injectable()
export class ActivitiesService {
  private readonly logger = new Logger(ActivitiesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new recorded activity.
   * Idempotent when externalId is provided (e.g. HealthKit / Health Connect sync).
   */
  async create(userId: string, dto: CreateActivityDto) {
    if (dto.externalId) {
      const existing = await this.prisma.activity.findUnique({
        where: { externalId: dto.externalId },
        include: {
          sport: true,
        },
      });
      if (existing) {
        return existing;
      }
    }

    const distanceKm =
      dto.distanceKm ?? Number((dto.distanceMeters / 1000).toFixed(2));

    const avgPaceSecPerKm =
      dto.avgPaceSecPerKm ??
      (distanceKm > 0
        ? Math.round(dto.durationSeconds / distanceKm)
        : null);

    const defaultTitle =
      dto.title?.trim() ||
      (dto.source === ActivitySource.IN_APP_TRACKER
        ? 'Course RunHub'
        : 'Activité synchronisée');

    let resolvedSportId = dto.sportId;
    if (!resolvedSportId && dto.sport) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dto.sport);
      const matched = await this.prisma.sport.findFirst({
        where: isUuid
          ? { OR: [{ id: dto.sport }, { slug: dto.sport }] }
          : { slug: dto.sport },
      });
      if (matched) {
        resolvedSportId = matched.id;
      }
    }

    const activity = await this.prisma.activity.create({
      data: {
        userId,
        sportId: resolvedSportId,
        title: defaultTitle,
        description: dto.description,
        source: dto.source ?? ActivitySource.IN_APP_TRACKER,
        externalId: dto.externalId,
        startedAt: new Date(dto.startedAt),
        endedAt: new Date(dto.endedAt),
        durationSeconds: dto.durationSeconds,
        distanceMeters: dto.distanceMeters,
        distanceKm,
        avgPaceSecPerKm,
        caloriesBurned: dto.caloriesBurned,
        elevationGainMeters: dto.elevationGainMeters,
        avgHeartRate: dto.avgHeartRate,
        maxHeartRate: dto.maxHeartRate,
        polyline: dto.polyline,
        visibility: dto.visibility ?? ActivityVisibility.PUBLIC,
      },
      include: {
        sport: true,
      },
    });

    return activity;
  }

  /**
   * Retrieves paginated activities for the authenticated user.
   */
  async findMyActivities(userId: string, query: QueryActivitiesDto) {
    const { limit = 20, cursor, sportId, startDate, endDate } = query;

    const where: any = {
      userId,
      deletedAt: null,
      ...(sportId ? { sportId } : {}),
      ...(startDate || endDate
        ? {
            startedAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
    };

    const activities = await this.prisma.activity.findMany({
      where,
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { startedAt: 'desc' },
      include: {
        sport: true,
      },
    });

    let nextCursor: string | null = null;
    if (activities.length > limit) {
      const nextItem = activities.pop();
      nextCursor = nextItem?.id || null;
    }

    return {
      activities,
      nextCursor,
    };
  }

  /**
   * Retrieves aggregated statistics (weekly km, monthly km, total stats) for a user.
   */
  async getUserStats(userId: string) {
    const now = new Date();

    // Start of current week (Monday 00:00:00)
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() + diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    // Start of current month (1st 00:00:00)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

    const [totalAggregate, weeklyAggregate, monthlyAggregate] = await Promise.all([
      this.prisma.activity.aggregate({
        where: { userId, deletedAt: null },
        _count: { id: true },
        _sum: {
          distanceKm: true,
          durationSeconds: true,
          caloriesBurned: true,
        },
      }),
      this.prisma.activity.aggregate({
        where: {
          userId,
          deletedAt: null,
          startedAt: { gte: startOfWeek },
        },
        _sum: { distanceKm: true },
      }),
      this.prisma.activity.aggregate({
        where: {
          userId,
          deletedAt: null,
          startedAt: { gte: startOfMonth },
        },
        _sum: { distanceKm: true },
      }),
    ]);

    const totalDistanceKm = Number((totalAggregate._sum.distanceKm || 0).toFixed(2));
    const totalDurationSeconds = totalAggregate._sum.durationSeconds || 0;
    const totalActivities = totalAggregate._count.id;
    const weeklyDistanceKm = Number((weeklyAggregate._sum.distanceKm || 0).toFixed(2));
    const monthlyDistanceKm = Number((monthlyAggregate._sum.distanceKm || 0).toFixed(2));
    const totalCaloriesBurned = totalAggregate._sum.caloriesBurned || 0;

    const avgPaceSecPerKm =
      totalDistanceKm > 0
        ? Math.round(totalDurationSeconds / totalDistanceKm)
        : 0;

    return {
      totalActivities,
      totalDistanceKm,
      weeklyDistanceKm,
      monthlyDistanceKm,
      totalDurationSeconds,
      totalCaloriesBurned,
      avgPaceSecPerKm,
    };
  }

  /**
   * Retrieves a single activity by ID, checking access visibility.
   */
  async findById(id: string, currentUserId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, deletedAt: null },
      include: {
        sport: true,
        user: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!activity) {
      throw new NotFoundException('Activité introuvable');
    }

    if (
      activity.visibility === ActivityVisibility.PRIVATE &&
      activity.userId !== currentUserId
    ) {
      throw new ForbiddenException('Cette activité est privée');
    }

    return activity;
  }

  /**
   * Updates an activity (title, description, visibility).
   */
  async update(id: string, userId: string, dto: UpdateActivityDto) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, deletedAt: null },
    });

    if (!activity) {
      throw new NotFoundException('Activité introuvable');
    }

    if (activity.userId !== userId) {
      throw new ForbiddenException('Vous ne pouvez modifier que vos propres activités');
    }

    return this.prisma.activity.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.visibility !== undefined ? { visibility: dto.visibility } : {}),
      },
      include: {
        sport: true,
      },
    });
  }

  /**
   * Soft-deletes an activity.
   */
  async delete(id: string, userId: string) {
    const activity = await this.prisma.activity.findFirst({
      where: { id, deletedAt: null },
    });

    if (!activity) {
      throw new NotFoundException('Activité introuvable');
    }

    if (activity.userId !== userId) {
      throw new ForbiddenException('Vous ne pouvez supprimer que vos propres activités');
    }

    await this.prisma.activity.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return { success: true };
  }
}
