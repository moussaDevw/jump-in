import { CanActivate, ExecutionContext, Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLUB_ROLE_KEY } from '../../common/decorators/club-role.decorator';
import { ClubRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ROLE_WEIGHTS: Record<ClubRole, number> = {
  [ClubRole.OWNER]: 3,
  [ClubRole.ADMIN]: 2,
  [ClubRole.MEMBER]: 1,
};

@Injectable()
export class ClubRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRole = this.reflector.getAllAndOverride<ClubRole>(CLUB_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no role is required, let request proceed
    if (!requiredRole) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const clubId = request.params.id || request.params.clubId;

    if (!user) {
      throw new ForbiddenException('User is not authenticated');
    }

    if (!clubId) {
      throw new NotFoundException('Club ID not found in request parameters');
    }

    // Platform Admins bypass club role guards
    if (user.isAdmin) {
      return true;
    }

    const member = await this.prisma.clubMember.findUnique({
      where: {
        clubId_userId: {
          clubId,
          userId: user.id,
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('You are not a member of this club');
    }

    const currentWeight = ROLE_WEIGHTS[member.role];
    const requiredWeight = ROLE_WEIGHTS[requiredRole];

    if (currentWeight < requiredWeight) {
      throw new ForbiddenException(`Access denied. Minimum role required: ${requiredRole}`);
    }

    return true;
  }
}
