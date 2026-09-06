import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves the current user's profile, including parsed geometry coordinates.
   */
  async getMe(userId: string) {
    const user = await this.findUserWithCoords(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /**
   * Updates the user profile details (checks for username uniqueness).
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check username uniqueness if changing
    if (dto.username && dto.username !== user.username) {
      const usernameExists = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (usernameExists) {
        throw new ConflictException('Username is already taken');
      }
    }

    const { coords, ...dataToUpdate } = dto;

    // Check if onboarding is now complete (firstName and lastName are present)
    const finalFirstName = dto.firstName || user.firstName;
    const finalLastName = dto.lastName || user.lastName;

    if (finalFirstName && finalLastName && !user.onboardingCompleted) {
      (dataToUpdate as any).onboardingCompleted = true;
    }

    // Run updates in a transaction to handle coords raw update
    if (coords) {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: userId },
          data: dataToUpdate,
        });

        await tx.$executeRaw`
          UPDATE users
          SET coords = ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326)
          WHERE id = ${userId}::uuid
        `;
      }, { timeout: 15000 });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: dataToUpdate,
      });
    }

    return this.getMe(userId);
  }

  /**
   * Dedicated endpoint for fast location updating.
   */
  async updateLocation(userId: string, dto: UpdateLocationDto) {
    await this.prisma.$executeRaw`
      UPDATE users
      SET coords = ST_SetSRID(ST_MakePoint(${dto.lng}, ${dto.lat}), 4326)
      WHERE id = ${userId}::uuid
    `;
    return { success: true, coords: { lat: dto.lat, lng: dto.lng } };
  }

  /**
   * Updates the user ecoData and notification settings.
   */
  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        ecoData: true,
        notifEnabled: true,
      },
    });
  }

  /**
   * Lists all sports associated with the user.
   */
  async getSports(userId: string) {
    const userSports = await this.prisma.userSport.findMany({
      where: { userId },
      include: {
        sport: true,
      },
    });
    return userSports.map((us) => us.sport);
  }

  /**
   * Replaces user's sport list.
   */
  async updateSports(userId: string, sportIds: string[]) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if all sports exist
    const sportsCount = await this.prisma.sport.count({
      where: { id: { in: sportIds } },
    });
    if (sportsCount !== sportIds.length) {
      throw new BadRequestException('One or more sport IDs are invalid');
    }

    return this.prisma.$transaction(async (tx) => {
      // Remove old associations
      await tx.userSport.deleteMany({
        where: { userId },
      });

      // Add new associations
      if (sportIds.length > 0) {
        await tx.userSport.createMany({
          data: sportIds.map((sportId) => ({
            userId,
            sportId,
          })),
        });
      }

      const updatedUserSports = await tx.userSport.findMany({
        where: { userId },
        include: {
          sport: true,
        },
      });

      return updatedUserSports.map((us) => us.sport);
    }, { timeout: 15000 });
  }

  /**
   * Lists all clubs the user is a member of (or has created).
   */
  async getMyClubs(userId: string) {
    const clubMembers = await this.prisma.clubMember.findMany({
      where: { userId },
      include: {
        club: {
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
        },
      },
    });
    
    // Format the response to match findOneInternal from clubs.service
    return clubMembers.map(cm => ({
      ...cm.club,
      sports: cm.club.sports.map((cs: any) => cs.sport),
      role: cm.role, // Attach the user's role in this club for the frontend
    }));
  }

  /**
   * Gets public profile of another user.
   */
  async getPublicProfile(targetId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetId, deletedAt: null },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        bio: true,
        city: true,
        sports: {
          include: {
            sport: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Public profile not found');
    }

    return {
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      city: user.city,
      sports: user.sports.map((us) => us.sport),
    };
  }

  /**
   * Soft-deletes a user account.
   */
  async softDelete(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Set deletedAt, nullify refresh token hash
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          refreshHash: null,
        },
      });

      // Delete active devices to stop receiving push notifications
      await tx.device.deleteMany({
        where: { userId },
      });
    }, { timeout: 15000 });

    return { success: true };
  }

  // --- Helper methods ---

  private async findUserWithCoords(userId: string) {
    const [user, geo] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId, deletedAt: null },
        select: {
          id: true,
          email: true,
          username: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          bio: true,
          city: true,
          ecoData: true,
          notifEnabled: true,
          onboardingCompleted: true,
          createdAt: true,
          updatedAt: true,
          sports: {
            select: {
              sport: true,
            },
          },
        },
      }),
      this.prisma.$queryRaw<any[]>`
        SELECT ST_X(coords::geometry) as lng, ST_Y(coords::geometry) as lat
        FROM users
        WHERE id = ${userId}::uuid
      `,
    ]);
    if (!user) return null;

    const coords = geo && geo[0] && geo[0].lng !== null ? { lat: geo[0].lat, lng: geo[0].lng } : null;

    return {
      ...user,
      sports: user.sports.map((us) => us.sport),
      coords,
    };
  }
}
