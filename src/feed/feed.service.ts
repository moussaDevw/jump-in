import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeoSpatialService } from '../common/services/geospatial.service';
import { FeedQueryDto } from './dto/feed-query.dto';
import { NearbyFeedDto } from './dto/nearby-feed.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geoSpatial: GeoSpatialService,
  ) {}

  /**
   * Public discovery feed: returns published, public future events ordered chronologically.
   */
  async getPublicFeed(dto: FeedQueryDto, userEcoData = false) {
    const { sportId, page = 1, limit = 20, ecoData } = dto;
    const isEco = ecoData ?? userEcoData;
    const offset = (page - 1) * limit;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`e.status = 'published'`,
      Prisma.sql`e.visibility = 'public'`,
      Prisma.sql`e.starts_at > NOW()`,
    ];

    if (sportId) {
      conditions.push(Prisma.sql`e.sport_id = ${sportId}::uuid`);
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    // Total count for pagination
    const countResult = await this.prisma.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int as count
      FROM events e
      ${whereClause}
    `;
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
      ORDER BY e.starts_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const mapped = this.mapFeedEvents(events, isEco);

    return {
      data: mapped,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
        ecoData: isEco,
      },
    };
  }

  /**
   * Nearby feed: returns upcoming public events within a given distance from (lat, lng).
   */
  async getNearbyFeed(dto: NearbyFeedDto, userEcoData = false) {
    const { lat, lng, radius = 20000, page = 1, limit = 20, ecoData } = dto;
    const isEco = ecoData ?? userEcoData;
    const offset = (page - 1) * limit;

    const userPoint = this.geoSpatial.formatPointSql(lng, lat);

    const conditions: Prisma.Sql[] = [
      Prisma.sql`e.status = 'published'`,
      Prisma.sql`e.visibility = 'public'`,
      Prisma.sql`e.starts_at > NOW()`,
      Prisma.sql`e.coords IS NOT NULL`,
      Prisma.sql`ST_DWithin(e.coords::geography, ${userPoint}::geography, ${radius})`,
    ];

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    // Total count for pagination
    const countResult = await this.prisma.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int as count
      FROM events e
      ${whereClause}
    `;
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
        ROUND(ST_Distance(e.coords::geography, ${userPoint}::geography)::numeric, 0) AS distance,
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
      ORDER BY distance ASC, e.starts_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const mapped = this.mapFeedEvents(events, isEco);

    return {
      data: mapped,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
        ecoData: isEco,
        radius,
      },
    };
  }

  /**
   * For-you feed: personalized based on user's favorite sports and followed clubs.
   */
  async getForYouFeed(userId: string, dto: FeedQueryDto) {
    const { page = 1, limit = 20, ecoData } = dto;
    const offset = (page - 1) * limit;

    // Fetch user preferences and ecoData setting
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ecoData: true,
        sports: { select: { sportId: true } },
        followedClubs: { select: { clubId: true } },
      },
    });

    const isEco = ecoData ?? user?.ecoData ?? false;
    const favoriteSportIds = user?.sports.map((s) => s.sportId) || [];
    const followedClubIds = user?.followedClubs.map((c) => c.clubId) || [];

    const conditions: Prisma.Sql[] = [
      Prisma.sql`e.status = 'published'`,
      Prisma.sql`e.visibility = 'public'`,
      Prisma.sql`e.starts_at > NOW()`,
    ];

    if (dto.sportId) {
      conditions.push(Prisma.sql`e.sport_id = ${dto.sportId}::uuid`);
    }

    const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;

    // Total count for pagination
    const countResult = await this.prisma.$queryRaw<[{ count: number }]>`
      SELECT COUNT(*)::int as count
      FROM events e
      ${whereClause}
    `;
    const total = countResult[0]?.count || 0;

    // Build relevance scoring: club events get score 2, sport events get score 1, others 0
    let scoreSql = Prisma.sql`0 AS relevance_score`;
    if (followedClubIds.length > 0 && favoriteSportIds.length > 0) {
      scoreSql = Prisma.sql`
        CASE
          WHEN e.club_id IN (${Prisma.join(followedClubIds.map((id) => Prisma.sql`${id}::uuid`), ', ')}) THEN 2
          WHEN e.sport_id IN (${Prisma.join(favoriteSportIds.map((id) => Prisma.sql`${id}::uuid`), ', ')}) THEN 1
          ELSE 0
        END AS relevance_score
      `;
    } else if (followedClubIds.length > 0) {
      scoreSql = Prisma.sql`
        CASE
          WHEN e.club_id IN (${Prisma.join(followedClubIds.map((id) => Prisma.sql`${id}::uuid`), ', ')}) THEN 2
          ELSE 0
        END AS relevance_score
      `;
    } else if (favoriteSportIds.length > 0) {
      scoreSql = Prisma.sql`
        CASE
          WHEN e.sport_id IN (${Prisma.join(favoriteSportIds.map((id) => Prisma.sql`${id}::uuid`), ', ')}) THEN 1
          ELSE 0
        END AS relevance_score
      `;
    }

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
        ${scoreSql},
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
      ORDER BY relevance_score DESC, e.starts_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const mapped = this.mapFeedEvents(events, isEco);

    return {
      data: mapped,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
        ecoData: isEco,
      },
    };
  }

  /**
   * Helper to format PostGIS coordinates, counts, and eco-data flags.
   */
  private mapFeedEvents(events: any[], isEco: boolean) {
    return events.map((e) => {
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
        distance: e.distance !== undefined && e.distance !== null ? Number(e.distance) : null,
        relevanceScore: e.relevance_score !== undefined ? Number(e.relevance_score) : undefined,
        sport: e.sport,
        club: e.club,
        organizer: e.organizer,
        _count: {
          registrations: e.registrationsCount || 0,
          likes: e.likesCount || 0,
          favorites: e.favoritesCount || 0,
        },
        isEco,
      };
    });
  }
}
