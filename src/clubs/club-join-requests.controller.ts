import { Controller, Get, Post, Patch, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ClubJoinRequestsService } from './club-join-requests.service';
import { RespondJoinRequestDto } from './dto/respond-join-request.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubRole } from '../common/decorators/club-role.decorator';
import { ClubRoleGuard } from './guards/club-role.guard';
import { ApiResponse } from '../common/dto/api-response.dto';
import { ClubRole } from '@prisma/client';

@Controller('clubs')
export class ClubJoinRequestsController {
  constructor(private readonly clubJoinRequestsService: ClubJoinRequestsService) {}

  @Post(':id/join-requests')
  @HttpCode(HttpStatus.CREATED)
  async createJoinRequest(
    @Param('id', ParseUUIDPipe) clubId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.clubJoinRequestsService.createJoinRequest(clubId, userId);
    return ApiResponse.success(result, 'Join request submitted successfully');
  }

  @Get(':id/join-requests')
  @RequireClubRole(ClubRole.ADMIN)
  @UseGuards(ClubRoleGuard)
  async getJoinRequests(
    @Param('id', ParseUUIDPipe) clubId: string,
  ) {
    const result = await this.clubJoinRequestsService.getJoinRequests(clubId);
    return ApiResponse.success(result, 'Join requests retrieved successfully');
  }

  @Patch(':id/join-requests/:requestId')
  @RequireClubRole(ClubRole.ADMIN)
  @UseGuards(ClubRoleGuard)
  async respondToJoinRequest(
    @Param('id', ParseUUIDPipe) clubId: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body() dto: RespondJoinRequestDto,
  ) {
    const result = await this.clubJoinRequestsService.respondToJoinRequest(clubId, requestId, dto.status);
    return ApiResponse.success(result, `Join request ${dto.status.toLowerCase()} successfully`);
  }
}
