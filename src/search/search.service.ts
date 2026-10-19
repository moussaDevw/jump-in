import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchClubsDto } from './dto/search-clubs.dto';
import { SearchEventsDto } from './dto/search-events.dto';
import { SearchUsersDto } from './dto/search-users.dto';
import { Prisma } from '@prisma/client';
import { GeoSpatialService } from '../common/services/geospatial.service';

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geoSpatial: GeoSpatialService,
  ) {}

  /**
   * Search clubs with optional geolocation and sport filters.
   */
  async searchClubs(dto: SearchClubsDto) {
    const { q, sportId, lat, lng, radius = 10000, page = 1, limit = 10 } = dto;
    const offset = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [];

    if (q) {
      const searchPattern = `%${q}%`;
      conditions.push(Prisma.sql`(c.name ILIKE ${searchPattern} OR c.handle ILIKE ${searchPattern})`);
    }

    if (sportId) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM club_sports cs 
        WHERE cs.club_id = c.id 
          AND cs.sport_id = ${sportId}::uuid
      )`);
    }

    let selectDistance = Prisma.sql`NULL::double precision as distance`;
    let orderBy = Prisma.sql`c.created_at DESC`;

    if (lat !== undefined && lng !== undefined) {
      const userPoint = this.geoSpatial.formatPointSql(lng, lat);
      selectDistance = Prisma.sql`ROUND(ST_Distance(c.coords::geography, ${userPoint}::geography)::numeric, 0) as distance`;
      
      if (radius !== undefined) {
        conditions.push(Prisma.sql`ST_DWithin(c.coords::geography, ${userPoint}::geography, ${radius})`);
      }
      orderBy = Prisma.sql`distance ASC, c.created_at DESC`;
    }

    const whereClause = conditions.length > 0 
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` 
      : Prisma.empty;

    // Count query
    const countQuery = Prisma.sql`
      SELECT COUNT(*)::int as count 
      FROM clubs c
      ${whereClause}
    `;
    const countResult = await this.prisma.$queryRaw<[{ count: number }]>(countQuery);
    const total = countResult[0]?.count || 0;

    // Data query
    const query = Prisma.sql`
      SELECT 
        c.id,
        c.name,
        c.handle,
        c.owner_id as "ownerId",
        c.bio,
        c.logo_url as "logoUrl",
        c.cover_url as "coverUrl",
        c.base_name as "baseName",
        c.verified,
        c.created_at as "createdAt",
        c.updated_at as "updatedAt",
        ST_X(c.coords::geometry) as lng,
        ST_Y(c.coords::geometry) as lat,
        (SELECT COUNT(*)::int FROM club_members cm WHERE cm.club_id = c.id) as "membersCount",
        (SELECT COUNT(*)::int FROM club_follows cf WHERE cf.club_id = c.id) as "followersCount",
        (SELECT COUNT(*)::int FROM events e WHERE e.club_id = c.id) as "eventsCount",
        ${selectDistance}
      FROM clubs c
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const clubs = await this.prisma.$queryRaw<any[]>(query);

    if (clubs.length === 0) {
      return {
        data: [],
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    const clubIds = clubs.map((c) => c.id);

    const clubSports = await this.prisma.clubSport.findMany({
      where: { clubId: { in: clubIds } },
      include: { sport: true },
    });

    const sportsMap = new Map<string, any[]>();
    for (const cs of clubSports) {
      const list = sportsMap.get(cs.clubId) || [];
      list.push(cs.sport);
      sportsMap.set(cs.clubId, list);
    }

    const mappedClubs = clubs.map((c) => {
      const coords = this.geoSpatial.extractCoordsFromRaw({ lat: c.lat, lng: c.lng });
      return {
        id: c.id,
        name: c.name,
        handle: c.handle,
        ownerId: c.ownerId,
        bio: c.bio,
        logoUrl: c.logoUrl,
        coverUrl: c.coverUrl,
        baseName: c.baseName,
        verified: c.verified,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        coords,
        distance: c.distance !== null && c.distance !== undefined ? Number(c.distance) : null,
        sports: sportsMap.get(c.id) || [],
        _count: {
          members: c.membersCount,
          followers: c.followersCount,
          events: c.eventsCount,
        },
      };
    });

    return {
      data: mappedClubs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Search events with multi-criteria filters (keywords, sport, club, dates, price, coordinates).
   */
  async searchEvents(dto: SearchEventsDto) {
    const {
      q,
      sportId,
      clubId,
      dateFrom,
      dateTo,
      freeOnly,
      priceMax,
      lat,
      lng,
      radius = 20000,
      page = 1,
      limit = 10,
    } = dto;
    const offset = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`e.status = 'published'`,
      Prisma.sql`e.visibility = 'public'`,
      Prisma.sql`e.starts_at > NOW()`,
    ];

    if (q) {
      const searchPattern = `%${q}%`;
      conditions.push(
        Prisma.sql`(e.title ILIKE ${searchPattern} OR e.description ILIKE ${searchPattern} OR e.venue_name ILIKE ${searchPattern} OR s.label_fr ILIKE ${searchPattern})`,
      );
    }

    if (sportId) {
      conditions.push(Prisma.sql`e.sport_id = ${sportId}::uuid`);
    }

    if (clubId) {
      conditions.push(Prisma.sql`e.club_id = ${clubId}::uuid`);
    }

    if (dateFrom) {
      conditions.push(Prisma.sql`e.starts_at >= ${new Date(dateFrom)}`);
    }

    if (dateTo) {
      conditions.push(Prisma.sql`e.starts_at <= ${new Date(dateTo)}`);
    }

    if (freeOnly) {
      conditions.push(Prisma.sql`e.price = 0`);
    } else if (priceMax !== undefined) {
      conditions.push(Prisma.sql`e.price <= ${priceMax}`);
    }

    let selectDistance = Prisma.sql`NULL::double precision as distance`;
    let orderBy = Prisma.sql`e.starts_at ASC`;

    if (lat !== undefined && lng !== undefined) {
      const userPoint = this.geoSpatial.formatPointSql(lng, lat);
      selectDistance = Prisma.sql`ROUND(ST_Distance(e.coords::geography, ${userPoint}::geography)::numeric, 0) as distance`;

      if (radius !== undefined) {
        conditions.push(Prisma.sql`e.coords IS NOT NULL`);
        conditions.push(Prisma.sql`ST_DWithin(e.coords::geography, ${userPoint}::geography, ${radius})`);
      }
      orderBy = Prisma.sql`distance ASC, e.starts_at ASC`;
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    // Total count
    const countQuery = Prisma.sql`
      SELECT COUNT(*)::int as count
      FROM events e
      JOIN sports s ON s.id = e.sport_id
      ${whereClause}
    `;
    const countResult = await this.prisma.$queryRaw<[{ count: number }]>(countQuery);
    const total = countResult[0]?.count || 0;

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
        e.city,
        e.country,
        e.created_at      AS "createdAt",
        ST_X(e.coords::geometry) AS lng,
        ST_Y(e.coords::geometry) AS lat,
        ${selectDistance},
        json_build_object(
          'id',      s.id,
          'slug',    s.slug,
          'labelFr', s.label_fr,
          'color',   s.color
        ) AS sport,
        CASE WHEN c.id IS NOT NULL THEN json_build_object(
          'id',      c.id,
          'name',    c.name,
          'handle',  c.handle,
          'logoUrl', c.logo_url
        ) ELSE NULL END AS club,
        json_build_object(
          'id',        o.id,
          'username',  o.username,
          'firstName', o.first_name,
          'lastName',  o.last_name,
          'avatarUrl', o.avatar_url
        ) AS organizer,
        (SELECT COUNT(*)::int FROM registrations r WHERE r.event_id = e.id AND r.status <> 'cancelled') AS "registrationsCount",
        (SELECT COUNT(*)::int FROM likes l WHERE l.event_id = e.id) AS "likesCount",
        (SELECT COUNT(*)::int FROM favorites f WHERE f.event_id = e.id) AS "favoritesCount"
      FROM events e
      JOIN sports s ON s.id = e.sport_id
      JOIN users o ON o.id = e.organizer_id
      LEFT JOIN clubs c ON c.id = e.club_id
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `;

    const mappedEvents = events.map((e) => {
      const coords = this.geoSpatial.extractCoordsFromRaw({ lat: e.lat, lng: e.lng });
      return {
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
        organizerId: e.organizerId,
        city: e.city,
        country: e.country,
        createdAt: e.createdAt,
        coords,
        distance: e.distance !== null && e.distance !== undefined ? Number(e.distance) : null,
        sport: e.sport,
        club: e.club,
        organizer: e.organizer,
        _count: {
          registrations: e.registrationsCount || 0,
          likes: e.likesCount || 0,
          favorites: e.favoritesCount || 0,
        },
      };
    });

    return {
      data: mappedEvents,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Search public users by username, firstName, or lastName.
   * Respects soft-delete (deletedAt IS NULL).
   */
  async searchUsers(dto: SearchUsersDto) {
    const { q, page = 1, limit = 10 } = dto;
    const offset = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [Prisma.sql`u.deleted_at IS NULL`];

    if (q) {
      const searchPattern = `%${q}%`;
      conditions.push(
        Prisma.sql`(u.username ILIKE ${searchPattern} OR u.first_name ILIKE ${searchPattern} OR u.last_name ILIKE ${searchPattern})`,
      );
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    // Total count
    const countQuery = Prisma.sql`
      SELECT COUNT(*)::int as count
      FROM users u
      ${whereClause}
    `;
    const countResult = await this.prisma.$queryRaw<[{ count: number }]>(countQuery);
    const total = countResult[0]?.count || 0;

    const users = await this.prisma.$queryRaw<any[]>`
      SELECT
        u.id,
        u.username,
        u.first_name AS "firstName",
        u.last_name  AS "lastName",
        u.avatar_url AS "avatarUrl",
        u.bio,
        u.city,
        u.created_at AS "createdAt",
        (SELECT COUNT(*)::int FROM club_members cm WHERE cm.user_id = u.id) AS "clubsCount",
        (SELECT COUNT(*)::int FROM events e WHERE e.organizer_id = u.id) AS "organizedEventsCount"
      FROM users u
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const mappedUsers = users.map((u) => ({
      id: u.id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      avatarUrl: u.avatarUrl,
      bio: u.bio,
      city: u.city,
      createdAt: u.createdAt,
      _count: {
        clubs: u.clubsCount || 0,
        organizedEvents: u.organizedEventsCount || 0,
      },
    }));

    return {
      data: mappedUsers,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
