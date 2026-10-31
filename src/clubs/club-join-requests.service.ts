import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubRole, JoinRequestStatus, NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ClubJoinRequestsService {
  private readonly logger = new Logger(ClubJoinRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

      // Si l'ancienne demande était REJECTED ou APPROVED (ex: l'utilisateur a quitté le club),
      // on réinitialise la demande à PENDING
      const updated = await this.prisma.clubJoinRequest.update({
        where: { id: existingRequest.id },
        data: { status: JoinRequestStatus.PENDING },
      });

      await this.notifyClubOwner(club, userId);
      return updated;
    }

    const created = await this.prisma.clubJoinRequest.create({
      data: {
        clubId,
        userId,
        status: JoinRequestStatus.PENDING,
      },
    });

    await this.notifyClubOwner(club, userId);
    return created;
  }

  /**
   * Helper to notify club owner about a new join request.
   */
  private async notifyClubOwner(club: { id: string; name: string; ownerId: string | null }, applicantUserId: string) {
    if (!club.ownerId || club.ownerId === applicantUserId) {
      return;
    }

    try {
      const applicant = await this.prisma.user.findUnique({
        where: { id: applicantUserId },
        select: { firstName: true, lastName: true, username: true },
      });

      const applicantName = [applicant?.firstName, applicant?.lastName].filter(Boolean).join(' ')
        || (applicant?.username ? `@${applicant.username}` : 'Un utilisateur');

      await this.notificationsService.sendLocalizedToUser(club.ownerId, {
        type: NotificationType.JOIN,
        template: 'CLUB_JOIN_REQUEST',
        params: {
          applicantName,
          clubName: club.name,
        },
        actorId: applicantUserId,
        data: {
          clubId: club.id,
          type: 'CLUB_JOIN_REQUEST',
        },
      });
    } catch (err) {
      this.logger.error(`Failed to notify owner ${club.ownerId} for club join request`, err);
    }
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

    const result = await this.prisma.$transaction(async (tx) => {
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

    if (status === JoinRequestStatus.APPROVED) {
      await this.notifyApplicantApproved(club, request.userId);
    } else if (status === JoinRequestStatus.REJECTED) {
      await this.notifyApplicantRejected(club, request.userId);
    }

    return result;
  }

  /**
   * Helper to notify applicant that their join request was approved.
   */
  private async notifyApplicantApproved(club: { id: string; name: string }, applicantUserId: string) {
    try {
      await this.notificationsService.sendLocalizedToUser(applicantUserId, {
        type: NotificationType.JOIN,
        template: 'CLUB_JOIN_APPROVED',
        params: {
          clubName: club.name,
        },
        data: {
          clubId: club.id,
          type: 'CLUB_JOIN_APPROVED',
        },
      });
    } catch (err) {
      this.logger.error(`Failed to notify applicant ${applicantUserId} of approval for club ${club.id}`, err);
    }
  }

  /**
   * Helper to notify applicant that their join request was rejected.
   */
  private async notifyApplicantRejected(club: { id: string; name: string }, applicantUserId: string) {
    try {
      await this.notificationsService.sendLocalizedToUser(applicantUserId, {
        type: NotificationType.JOIN,
        template: 'CLUB_JOIN_REJECTED',
        params: {
          clubName: club.name,
        },
        data: {
          clubId: club.id,
          type: 'CLUB_JOIN_REJECTED',
        },
      });
    } catch (err) {
      this.logger.error(`Failed to notify applicant ${applicantUserId} of rejection for club ${club.id}`, err);
    }
  }

  /**
   * Cancels a pending join request by the requesting user.
   */
  async cancelJoinRequest(clubId: string, userId: string) {
    const request = await this.prisma.clubJoinRequest.findUnique({
      where: {
        clubId_userId: { clubId, userId },
      },
    });

    if (!request) {
      throw new NotFoundException('No join request found');
    }

    if (request.status !== JoinRequestStatus.PENDING) {
      throw new BadRequestException('Can only cancel a pending join request');
    }

    await this.prisma.clubJoinRequest.delete({
      where: { id: request.id },
    });

    return { success: true, message: 'Join request cancelled successfully' };
  }
}
