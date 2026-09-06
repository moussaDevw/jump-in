import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClubFollowsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Follows a club.
   */
  async follow(clubId: string, userId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const followExists = await this.prisma.clubFollow.findUnique({
      where: {
        userId_clubId: { userId, clubId },
      },
    });
    if (followExists) {
      return { success: true, message: 'Already following' };
    }

    await this.prisma.clubFollow.create({
      data: {
        userId,
        clubId,
      },
    });

    return { success: true };
  }

  /**
   * Unfollows a club.
   */
  async unfollow(clubId: string, userId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const followExists = await this.prisma.clubFollow.findUnique({
      where: {
        userId_clubId: { userId, clubId },
      },
    });
    if (!followExists) {
      return { success: true, message: 'Not following' };
    }

    await this.prisma.clubFollow.delete({
      where: {
        userId_clubId: { userId, clubId },
      },
    });

    return { success: true };
  }
}
