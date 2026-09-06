import { Module } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { ClubsController } from './clubs.controller';
import { ClubMembersService } from './club-members.service';
import { ClubMembersController } from './club-members.controller';
import { ClubFollowsService } from './club-follows.service';
import { ClubFollowsController } from './club-follows.controller';
import { ClubJoinRequestsService } from './club-join-requests.service';
import { ClubJoinRequestsController } from './club-join-requests.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [
    ClubsController,
    ClubMembersController,
    ClubFollowsController,
    ClubJoinRequestsController,
  ],
  providers: [
    ClubsService,
    ClubMembersService,
    ClubFollowsService,
    ClubJoinRequestsService,
  ],
  exports: [
    ClubsService,
    ClubMembersService,
    ClubFollowsService,
    ClubJoinRequestsService,
  ],
})
export class ClubsModule {}
