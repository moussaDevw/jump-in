import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { FindAllEventsDto } from './dto/find-all-events.dto';
import { EventStatus, ClubRole, Prisma } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) { }

  /**
   * Helper to generate a unique shareSlug.
   */
  private async generateUniqueSlug(): Promise<string> {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let slug = '';
    let isUnique = false;

    while (!isUnique) {
      slug = '';
      for (let i = 0; i < 10; i++) {
        slug += chars[crypto.randomInt(0, chars.length)];
      }

      const exists = await this.prisma.event.findUnique({
        where: { shareSlug: slug },
      });
      if (!exists) {
        isUnique = true;
      }
    }
    return slug;
  }

  /**
   * Creates a new event (in DRAFT status by default).
   */
  async create(userId: string, dto: CreateEventDto) {
    const { coords, clubId, sportId, startsAt, endsAt, ...eventData } = dto;

    // Validate dates
    const startDate = new Date(startsAt);
    if (startDate.getTime() < Date.now()) {
      throw new BadRequestException('Event start date must be in the future');
    }

    if (endsAt) {
      const endDate = new Date(endsAt);
      if (endDate.getTime() <= startDate.getTime()) {
        throw new BadRequestException('Event end date must be after start date');
      }
    }

    // Validate sport exists
    const sport = await this.prisma.sport.findUnique({ where: { id: sportId } });
    if (!sport) {
      throw new NotFoundException('Sport not found');
    }

    // Validate club and role if clubId is provided
    if (clubId) {
      const club = await this.prisma.club.findUnique({ where: { id: clubId } });
      if (!club) {
        throw new NotFoundException('Club not found');
      }

      const member = await this.prisma.clubMember.findUnique({
        where: {
          clubId_userId: { clubId, userId },
        },
      });

      if (!member || (member.role !== ClubRole.ADMIN && member.role !== ClubRole.OWNER)) {
        // Also check if they are global admin
        const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!currentUser?.isAdmin) {
          throw new ForbiddenException('Only club owners or admins can create events for this club');
        }
      }
    }

    const shareSlug = await this.generateUniqueSlug();

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          ...eventData,
          shareSlug,
          organizerId: userId,
          clubId,
          sportId,
          startsAt: startDate,
          endsAt: endsAt ? new Date(endsAt) : null,
          status: EventStatus.DRAFT,
        },
      });

      if (coords) {
        await tx.$executeRaw`
          UPDATE events
          SET coords = ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326)
          WHERE id = ${event.id}::uuid
        `;
      }

      return this.findOneInternal(event.id, tx);
    });
  }

  /**
   * Retrieves detail of an event.
   */
  async findOne(id: string) {
    const event = await this.findOneInternal(id, this.prisma);
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  /**
   * Resolves a shareSlug to get event details.
   */
  async findByShareSlug(slug: string) {
    const event = await this.prisma.event.findUnique({
      where: { shareSlug: slug },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return this.findOne(event.id);
  }

  /**
   * Updates an event.
   */
  async update(id: string, userId: string, dto: UpdateEventDto) {
    const event = await this.findOne(id);

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Cannot update a cancelled event');
    }

    const { coords, clubId, sportId, startsAt, endsAt, ...dataToUpdate } = dto;

    let startDate = event.startsAt;
    if (startsAt) {
      startDate = new Date(startsAt);
      if (startDate.getTime() < Date.now()) {
        throw new BadRequestException('Event start date must be in the future');
      }
    }

    let endDate = event.endsAt;
    if (endsAt) {
      endDate = new Date(endsAt);
      if (endDate.getTime() <= startDate.getTime()) {
        throw new BadRequestException('Event end date must be after start date');
      }
    } else if (startsAt && event.endsAt) {
      if (event.endsAt.getTime() <= startDate.getTime()) {
        throw new BadRequestException('Event end date must be after start date');
      }
    }

    if (sportId && sportId !== event.sportId) {
      const sport = await this.prisma.sport.findUnique({ where: { id: sportId } });
      if (!sport) {
        throw new NotFoundException('Sport not found');
      }
    }

    if (clubId && clubId !== event.clubId) {
      const club = await this.prisma.club.findUnique({ where: { id: clubId } });
      if (!club) {
        throw new NotFoundException('Club not found');
      }

      const member = await this.prisma.clubMember.findUnique({
        where: {
          clubId_userId: { clubId, userId },
        },
      });
      if (!member || (member.role !== ClubRole.ADMIN && member.role !== ClubRole.OWNER)) {
        const currentUser = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!currentUser?.isAdmin) {
          throw new ForbiddenException('Only club owners or admins can link events to this club');
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id },
        data: {
          ...dataToUpdate,
          sportId,
          clubId,
          startsAt: startsAt ? startDate : undefined,
          endsAt: endsAt ? endDate : undefined,
        },
      });

      if (coords) {
        await tx.$executeRaw`
          UPDATE events
          SET coords = ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326)
          WHERE id = ${id}::uuid
        `;
      }

      return this.findOneInternal(id, tx);
    });
  }

  /**
   * Publishes a draft event.
   */
  async publish(id: string) {
    const event = await this.findOne(id);

    if (event.status === EventStatus.PUBLISHED) {
      throw new BadRequestException('Event is already published');
    }
    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Cannot publish a cancelled event');
    }

    return this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.PUBLISHED },
    });
  }

  /**
   * Cancels a published event.
   */
  async cancel(id: string) {
    const event = await this.findOne(id);

    if (event.status === EventStatus.CANCELLED) {
      throw new BadRequestException('Event is already cancelled');
    }

    const updatedEvent = await this.prisma.event.update({
      where: { id },
      data: { status: EventStatus.CANCELLED },
    });

    return updatedEvent;
  }

  // --- Helper Methods ---

  async checkAuthorization(event: any, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user?.isAdmin) {
      return; // Platform admin always authorized
    }

    if (event.organizerId === userId) {
      return; // Organizer authorized
    }

    if (event.clubId) {
      const member = await this.prisma.clubMember.findUnique({
        where: {
          clubId_userId: { clubId: event.clubId, userId },
        },
      });
      if (member && (member.role === ClubRole.ADMIN || member.role === ClubRole.OWNER)) {
        return; // Club admin/owner authorized
      }
    }

    throw new ForbiddenException('You are not authorized to perform this action on this event');
  }

  private async findOneInternal(id: string, client: any) {
    const event = await client.event.findUnique({
      where: { id },
      include: {
        sport: true,
        club: {
          select: {
            id: true,
            name: true,
            handle: true,
            logoUrl: true,
          },
        },
        organizer: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            registrations: true,
            likes: true,
            favoritedBy: true,
          },
        },
      },
    });

    if (!event) return null;

    // Get coords via raw query
    const geo: any[] = await client.$queryRaw`
      SELECT ST_X(coords::geometry) as lng, ST_Y(coords::geometry) as lat
      FROM events
      WHERE id = ${id}::uuid
    `;

    const coords = geo && geo[0] && geo[0].lng !== null ? { lat: geo[0].lat, lng: geo[0].lng } : null;

    return {
      ...event,
      coords,
    };
  }

  /**
   * Lists published future events with pagination and optional sport filter.
   * Uses a single SQL query to avoid N+1 on coordinates.
   */
  async findAll(dto: FindAllEventsDto = {}) {
    const { sportId, q, dateFilter, page = 1, limit = 20 } = dto;
    const offset = (page - 1) * limit;

    // Build WHERE conditions
    const conditions: Prisma.Sql[] = [
      Prisma.sql`e.status = 'published'`,
      Prisma.sql`e.starts_at > NOW()`,
    ];

    if (dateFilter) {
      const now = new Date();
      if (dateFilter === 'today') {
        const end = new Date();
        end.setHours(23, 59, 59, 999);
        conditions.push(Prisma.sql`e.starts_at <= ${end}`);
      } else if (dateFilter === 'weekend') {
        const day = now.getDay();
        const end = new Date();
        const daysToSunday = day === 0 ? 0 : 7 - day;
        end.setDate(end.getDate() + daysToSunday);
        end.setHours(23, 59, 59, 999);
        
        let start = new Date();
        if (day < 5 || (day === 5 && now.getHours() < 17)) {
          start.setDate(start.getDate() + (5 - day));
          start.setHours(17, 0, 0, 0);
        }
        conditions.push(Prisma.sql`e.starts_at >= ${start} AND e.starts_at <= ${end}`);
      } else if (dateFilter === 'week') {
        const end = new Date();
        const daysToSunday = end.getDay() === 0 ? 0 : 7 - end.getDay();
        end.setDate(end.getDate() + daysToSunday);
        end.setHours(23, 59, 59, 999);
        conditions.push(Prisma.sql`e.starts_at <= ${end}`);
      } else if (dateFilter === 'month') {
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        conditions.push(Prisma.sql`e.starts_at <= ${end}`);
      }
    }

    if (sportId) {
      conditions.push(Prisma.sql`e.sport_id = ${sportId}::uuid`);
    }

    if (dto.clubId) {
      conditions.push(Prisma.sql`e.club_id = ${dto.clubId}::uuid`);
    }

    if (q) {
      const searchPattern = `%${q}%`;
      conditions.push(Prisma.sql`(e.title ILIKE ${searchPattern} OR e.venue_name ILIKE ${searchPattern} OR s.label_fr ILIKE ${searchPattern})`);
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    // Count total
    const countResult = await this.prisma.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int as count
      FROM events e
      JOIN sports s ON s.id = e.sport_id
      ${whereClause}
    `;
    const total = countResult[0]?.count || 0;

    // Single query with all JOINs — no N+1
    const events = await this.prisma.$queryRaw<any[]>`
      SELECT
        e.id,
        e.title,
        e.description,
        e.cover_url       AS "coverUrl",
        e.starts_at       AS "startsAt",
        e.ends_at         AS "endsAt",
        e.venue_name      AS "venueName",
        e.capacity,
        e.price,
        e.currency,
        e.status,
        e.visibility,
        e.share_slug      AS "shareSlug",
        e.sport_id        AS "sportId",
        e.club_id         AS "clubId",
        e.organizer_id    AS "organizerId",
        e.google_place_id AS "googlePlaceId",
        e.city,
        e.country,
        e.created_at      AS "createdAt",
        e.updated_at      AS "updatedAt",
        ST_X(e.coords::geometry) AS lng,
        ST_Y(e.coords::geometry) AS lat,
        -- Sport JSON
        json_build_object(
          'id',      s.id,
          'slug',    s.slug,
          'labelFr', s.label_fr,
          'color',   s.color
        ) AS sport,
        -- Club JSON
        CASE WHEN c.id IS NOT NULL THEN json_build_object(
          'id',      c.id,
          'name',    c.name,
          'handle',  c.handle,
          'logoUrl', c.logo_url
        ) ELSE NULL END AS club,
        -- Organizer JSON
        json_build_object(
          'id',        o.id,
          'username',  o.username,
          'firstName', o.first_name,
          'lastName',  o.last_name,
          'avatarUrl', o.avatar_url
        ) AS organizer,
        -- Counts
        (SELECT COUNT(*)::int FROM registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS "registrationsCount",
        (SELECT COUNT(*)::int FROM likes l WHERE l.event_id = e.id) AS "likesCount",
        (SELECT COUNT(*)::int FROM favorites f WHERE f.event_id = e.id) AS "favoritesCount"
      FROM events e
      JOIN sports s ON s.id = e.sport_id
      JOIN users o ON o.id = e.organizer_id
      LEFT JOIN clubs c ON c.id = e.club_id
      ${whereClause}
      ORDER BY e.starts_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const data = events.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description,
      coverUrl: e.coverUrl,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      venueName: e.venueName,
      capacity: e.capacity,
      price: e.price,
      currency: e.currency,
      status: e.status,
      visibility: e.visibility,
      shareSlug: e.shareSlug,
      sportId: e.sportId,
      clubId: e.clubId,
      club: e.club,
      organizerId: e.organizerId,
      googlePlaceId: e.googlePlaceId,
      city: e.city,
      country: e.country,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      coords: e.lng !== null && e.lat !== null ? { lat: e.lat, lng: e.lng } : null,
      sport: e.sport,
      organizer: e.organizer,
      _count: {
        registrations: e.registrationsCount,
        likes: e.likesCount,
        favoritedBy: e.favoritesCount,
      },
    }));

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Lists all events created by the current user (all statuses: DRAFT, PUBLISHED, CANCELLED).
   */
  async findMine(userId: string) {
    const events = await this.prisma.event.findMany({
      where: { organizerId: userId },
      include: {
        sport: true,
        organizer: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            registrations: true,
            likes: true,
            favoritedBy: true,
          },
        },
      },
      orderBy: { startsAt: 'desc' },
    });

    // Batch fetch coordinates for all events in a single query
    if (events.length === 0) return events;

    const eventIds = events.map((e) => e.id);
    const geoResults = await this.prisma.$queryRaw<any[]>`
      SELECT id, ST_X(coords::geometry) as lng, ST_Y(coords::geometry) as lat
      FROM events
      WHERE id = ANY(${eventIds}::uuid[])
    `;

    const geoMap = new Map<string, { lat: number; lng: number }>();
    for (const g of geoResults) {
      if (g.lng !== null && g.lat !== null) {
        geoMap.set(g.id, { lat: g.lat, lng: g.lng });
      }
    }

    return events.map((event) => ({
      ...event,
      coords: geoMap.get(event.id) || null,
    }));
  }
}
