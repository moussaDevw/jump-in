import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubRole, JoinRequestStatus } from '@prisma/client';

@Injectable()
export class ClubJoinRequestsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a request to join a club.
   */
  async createJoinRequest(clubId: string, userId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    // Check if user is already a member
    const existingMember = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });
    if (existingMember) {
      throw new ConflictException('User is already a member of this club');
    }

    // Check if there is an active join request
    const existingRequest = await this.prisma.clubJoinRequest.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });

    if (existingRequest) {
      if (existingRequest.status === JoinRequestStatus.PENDING) {
        throw new ConflictException('A join request is already pending for this club');
      }
      if (existingRequest.status === JoinRequestStatus.APPROVED) {
        throw new ConflictException('Your join request was already approved');
      }

      // If it was REJECTED, we reset it to PENDING
      return this.prisma.clubJoinRequest.update({
        where: { id: existingRequest.id },
        data: { status: JoinRequestStatus.PENDING },
      });
    }

    return this.prisma.clubJoinRequest.create({
      data: {
        clubId,
        userId,
        status: JoinRequestStatus.PENDING,
      },
    });
  }

  /**
   * Lists all pending join requests for a club.
   */
  async getJoinRequests(clubId: string) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    return this.prisma.clubJoinRequest.findMany({
      where: {
        clubId,
        status: JoinRequestStatus.PENDING,
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
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Responds to a join request (approves or rejects).
   */
  async respondToJoinRequest(clubId: string, requestId: string, status: JoinRequestStatus) {
    const club = await this.prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      throw new NotFoundException('Club not found');
    }

    const request = await this.prisma.clubJoinRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.clubId !== clubId) {
      throw new NotFoundException('Join request not found');
    }

    if (request.status !== JoinRequestStatus.PENDING) {
      throw new BadRequestException('Join request has already been processed');
    }

    if (status === JoinRequestStatus.PENDING) {
      throw new BadRequestException('Cannot set status to pending');
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Update the request status
      const updatedRequest = await tx.clubJoinRequest.update({
        where: { id: requestId },
        data: { status },
      });

      // 2. If approved, add user as a member
      if (status === JoinRequestStatus.APPROVED) {
        // Double check member entry doesn't exist
        const existingMember = await tx.clubMember.findUnique({
          where: {
            clubId_userId: { clubId, userId: request.userId },
          },
        });

        if (!existingMember) {
          await tx.clubMember.create({
            data: {
              clubId,
              userId: request.userId,
              role: ClubRole.MEMBER,
            },
          });
        }
      }

      return updatedRequest;
    });
  }
}
