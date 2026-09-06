import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchClubsDto } from './dto/search-clubs.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

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
      const userPoint = Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
      selectDistance = Prisma.sql`ST_Distance(c.coords::geography, ${userPoint}::geography) as distance`;
      
      if (radius !== undefined) {
        conditions.push(Prisma.sql`ST_DWithin(c.coords::geography, ${userPoint}::geography, ${radius})`);
      }
      orderBy = Prisma.sql`distance ASC, c.created_at DESC`;
    }

    const whereClause = conditions.length > 0 
      ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` 
      : Prisma.empty;

    // Get total count for pagination
    const countQuery = Prisma.sql`
      SELECT COUNT(*)::int as count 
      FROM clubs c
      ${whereClause}
    `;

    const countResult = await this.prisma.$queryRaw<[{ count: number }]>(countQuery);
    const total = countResult[0]?.count || 0;

    // Get clubs
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

    // Fetch sports for all retrieved clubs
    const clubSports = await this.prisma.clubSport.findMany({
      where: { clubId: { in: clubIds } },
      include: { sport: true },
    });

    // Map sports to their respective clubs
    const sportsMap = new Map<string, any[]>();
    for (const cs of clubSports) {
      const list = sportsMap.get(cs.clubId) || [];
      list.push(cs.sport);
      sportsMap.set(cs.clubId, list);
    }

    const mappedClubs = clubs.map((c) => {
      const coords = c.lng !== null && c.lat !== null ? { lat: c.lat, lng: c.lng } : null;
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
        distance: c.distance,
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
}
