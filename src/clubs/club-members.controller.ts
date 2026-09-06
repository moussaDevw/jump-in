import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ClubMembersService } from './club-members.service';
import { AddMemberDto } from './dto/add-member.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubRole } from '../common/decorators/club-role.decorator';
import { ClubRoleGuard } from './guards/club-role.guard';
import { ApiResponse } from '../common/dto/api-response.dto';
import { ClubRole } from '@prisma/client';

@Controller('clubs')
export class ClubMembersController {
  constructor(private readonly clubMembersService: ClubMembersService) {}

  @Get(':id/members')
  async getMembers(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.clubMembersService.getMembers(id);
    return ApiResponse.success(result, 'Club members retrieved successfully');
  }

  @Post(':id/members')
  @RequireClubRole(ClubRole.ADMIN)
  @UseGuards(ClubRoleGuard)
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @Param('id', ParseUUIDPipe) clubId: string,
    @Body() addMemberDto: AddMemberDto,
  ) {
    const result = await this.clubMembersService.addMember(clubId, addMemberDto.userId, addMemberDto.role);
    return ApiResponse.success(result, 'Member added successfully');
  }

  @Patch(':id/members/:userId')
  @RequireClubRole(ClubRole.OWNER)
  @UseGuards(ClubRoleGuard)
  async updateMemberRole(
    @Param('id', ParseUUIDPipe) clubId: string,
    @Param('userId', ParseUUIDPipe) memberId: string,
    @Body('role') role: ClubRole,
  ) {
    const result = await this.clubMembersService.updateMemberRole(clubId, memberId, role);
    return ApiResponse.success(result, 'Member role updated successfully');
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.OK)
  async removeMember(
    @Param('id', ParseUUIDPipe) clubId: string,
    @Param('userId', ParseUUIDPipe) memberId: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    const result = await this.clubMembersService.removeMember(clubId, memberId, currentUserId);
    return ApiResponse.success(result, 'Member removed successfully');
  }
}
