import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubRole } from '@prisma/client';

@Injectable()
export class ClubMembersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves members of a club.
   */
  async getMembers(clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    return this.prisma.clubMember.findMany({
      where: { clubId },
      include: {
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
      orderBy: {
        role: 'asc',
      },
    });
  }

  /**
   * Adds a user to a club as a member.
   */
  async addMember(clubId: string, userId: string, role: ClubRole = ClubRole.MEMBER) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingMember = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });
    if (existingMember) {
      throw new ConflictException('User is already a member of this club');
    }

    return this.prisma.clubMember.create({
      data: {
        clubId,
        userId,
        role,
      },
      include: {
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
  }

  /**
   * Updates a club member's role (supports ownership transfers).
   */
  async updateMemberRole(clubId: string, memberId: string, newRole: ClubRole) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const member = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId: memberId },
      },
    });
    if (!member) {
      throw new NotFoundException('Club member not found');
    }

    if (newRole === ClubRole.OWNER) {
      // Transfer of ownership
      const currentOwnerId = club.ownerId;
      if (!currentOwnerId) {
        throw new BadRequestException('Club has no active owner to transfer from');
      }

      return this.prisma.$transaction(async (tx) => {
        // Demote current owner to ADMIN
        await tx.clubMember.update({
          where: {
            clubId_userId: { clubId, userId: currentOwnerId },
          },
          data: { role: ClubRole.ADMIN },
        });

        // Promote new member to OWNER
        const updated = await tx.clubMember.update({
          where: {
            clubId_userId: { clubId, userId: memberId },
          },
          data: { role: ClubRole.OWNER },
        });

        // Update club ownerId reference
        await tx.club.update({
          where: { id: clubId },
          data: { ownerId: memberId },
        });

        return updated;
      });
    }

    if (member.role === ClubRole.OWNER) {
      throw new BadRequestException('The owner cannot be demoted. You must transfer ownership to another member first.');
    }

    return this.prisma.clubMember.update({
      where: {
        clubId_userId: { clubId, userId: memberId },
      },
      data: { role: newRole },
    });
  }

  /**
   * Removes a member from a club.
   */
  async removeMember(clubId: string, memberId: string, currentUserId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const member = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId: memberId },
      },
    });
    if (!member) {
      throw new NotFoundException('Club member not found');
    }

    // Owner leaves
    if (member.role === ClubRole.OWNER) {
      throw new BadRequestException('The owner cannot leave the club. Transfer ownership first.');
    }

    // Authorization checks (if not leaving voluntarily)
    if (memberId !== currentUserId) {
      const currentUser = await this.prisma.user.findUnique({
        where: { id: currentUserId, deletedAt: null },
      });

      if (currentUser?.isAdmin) {
        // No check needed here since owner check was handled above
      } else {
        const currentUserMember = await this.prisma.clubMember.findUnique({
          where: {
            clubId_userId: { clubId, userId: currentUserId },
          },
        });

        if (!currentUserMember || currentUserMember.role === ClubRole.MEMBER) {
          throw new ForbiddenException('You are not authorized to perform this action');
        }

        // Admins can only kick regular members
        if (currentUserMember.role === ClubRole.ADMIN) {
          if (member.role === ClubRole.ADMIN) {
            throw new ForbiddenException('Admins can only kick regular members');
          }
        }
      }
    }

    await this.prisma.clubMember.delete({
      where: {
        clubId_userId: { clubId, userId: memberId },
      },
    });

    return { success: true };
  }
}
