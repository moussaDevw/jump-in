import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { ClubRole } from '@prisma/client';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new club and assigns the creator as the OWNER (using a transaction).
   */
  async create(userId: string, dto: CreateClubDto) {
    // Check handle uniqueness
    const handleExists = await this.prisma.club.findUnique({
      where: { handle: dto.handle },
    });
    if (handleExists) {
      throw new ConflictException('Club handle is already taken');
    }

    const { coords, ...clubData } = dto;

    return this.prisma.$transaction(async (tx) => {
      // 1. Create the club
      const club = await tx.club.create({
        data: {
          ...clubData,
          ownerId: userId,
        },
      });

      // 2. Add owner to members list
      await tx.clubMember.create({
        data: {
          userId,
          clubId: club.id,
          role: ClubRole.OWNER,
        },
      });

      // 3. Update coords if provided
      if (coords) {
        await tx.$executeRaw`
          UPDATE clubs
          SET coords = ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326)
          WHERE id = ${club.id}::uuid
        `;
      }

      return this.findOneInternal(club.id, tx);
    });
  }

  /**
   * Returns details of a club.
   */
  async findOne(id: string, currentUserId?: string) {
    const club = await this.findOneInternal(id, this.prisma, currentUserId);
    if (!club) {
      throw new NotFoundException('Club not found');
    }
    return club;
  }

  /**
   * Updates an existing club.
   */
  async update(id: string, dto: UpdateClubDto) {
    const club = await this.prisma.club.findUnique({
      where: { id },
    });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    if (dto.handle && dto.handle !== club.handle) {
      const handleExists = await this.prisma.club.findUnique({
        where: { handle: dto.handle },
      });
      if (handleExists) {
        throw new ConflictException('Club handle is already taken');
      }
    }

    const { coords, ...dataToUpdate } = dto;

    return this.prisma.$transaction(async (tx) => {
      await tx.club.update({
        where: { id },
        data: dataToUpdate,
      });

      if (coords) {
        await tx.$executeRaw`
          UPDATE clubs
          SET coords = ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326)
          WHERE id = ${id}::uuid
        `;
      }

      return this.findOneInternal(id, tx);
    });
  }

  /**
   * Deletes a club.
   */
  async delete(id: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
    });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    await this.prisma.club.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Retrieves sports associated with the club.
   */
  async getSports(clubId: string) {
    await this.findOne(clubId);

    const clubSports = await this.prisma.clubSport.findMany({
      where: { clubId },
      include: {
        sport: true,
      },
    });

    return clubSports.map((cs) => cs.sport);
  }

  /**
   * Replaces sports list of a club.
   */
  async updateSports(clubId: string, sportIds: string[]) {
    await this.findOne(clubId);

    // Validate all sports exist
    const sportsCount = await this.prisma.sport.count({
      where: { id: { in: sportIds } },
    });
    if (sportsCount !== sportIds.length) {
      throw new BadRequestException('One or more sport IDs are invalid');
    }

    return this.prisma.$transaction(async (tx) => {
      // Remove old sports
      await tx.clubSport.deleteMany({
        where: { clubId },
      });

      // Add new sports
      if (sportIds.length > 0) {
        await tx.clubSport.createMany({
          data: sportIds.map((sportId) => ({
            clubId,
            sportId,
          })),
        });
      }

      const updatedClubSports = await tx.clubSport.findMany({
        where: { clubId },
        include: {
          sport: true,
        },
      });

      return updatedClubSports.map((cs) => cs.sport);
    });
  }

  // --- Helper Methods ---

  private async findOneInternal(id: string, client: any, currentUserId?: string) {
    const club = await client.club.findUnique({
      where: { id },
      include: {
        sports: {
          include: {
            sport: true,
          },
        },
        _count: {
          select: {
            members: true,
            followers: true,
            events: true,
          },
        },
      },
    });
    if (!club) return null;

    // Get coords via raw query
    const geo: any[] = await client.$queryRaw`
      SELECT ST_X(coords::geometry) as lng, ST_Y(coords::geometry) as lat
      FROM clubs
      WHERE id = ${id}::uuid
    `;

    const coords = geo && geo[0] && geo[0].lng !== null ? { lat: geo[0].lat, lng: geo[0].lng } : null;

    let isMember = false;
    let isFollower = false;
    let joinRequestStatus: string | null = null;
    let myRole: string | null = null;

    if (currentUserId) {
      const member = await client.clubMember.findUnique({
        where: {
          clubId_userId: { clubId: id, userId: currentUserId },
        },
      });
      isMember = !!member;
      myRole = member?.role ?? null;

      const follower = await client.clubFollow.findUnique({
        where: {
          userId_clubId: { userId: currentUserId, clubId: id },
        },
      });
      isFollower = !!follower;

      const joinReq = await client.clubJoinRequest.findUnique({
        where: {
          clubId_userId: { clubId: id, userId: currentUserId },
        },
      });
      joinRequestStatus = joinReq ? joinReq.status : null;
    }

    return {
      ...club,
      sports: club.sports.map((cs: any) => cs.sport),
      coords,
      isMember,
      isFollower,
      joinRequestStatus,
      myRole,
    };
  }
}
