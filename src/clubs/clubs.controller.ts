import { Controller, Get, Post, Patch, Delete, Put, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequireClubRole } from '../common/decorators/club-role.decorator';
import { ClubRoleGuard } from './guards/club-role.guard';
import { ApiResponse } from '../common/dto/api-response.dto';
import { ClubRole } from '@prisma/client';
import { UpdateSportsDto } from '../users/dto/update-sports.dto';

@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('id') userId: string,
    @Body() createClubDto: CreateClubDto,
  ) {
    const result = await this.clubsService.create(userId, createClubDto);
    return ApiResponse.success(result, 'Club created successfully');
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.clubsService.findOne(id, userId);
    return ApiResponse.success(result, 'Club retrieved successfully');
  }

  @Patch(':id')
  @RequireClubRole(ClubRole.ADMIN)
  @UseGuards(ClubRoleGuard)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClubDto: UpdateClubDto,
  ) {
    const result = await this.clubsService.update(id, updateClubDto);
    return ApiResponse.success(result, 'Club updated successfully');
  }

  @Delete(':id')
  @RequireClubRole(ClubRole.OWNER)
  @UseGuards(ClubRoleGuard)
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.clubsService.delete(id);
    return ApiResponse.success(result, 'Club deleted successfully');
  }

  @Get(':id/sports')
  async getSports(@Param('id', ParseUUIDPipe) clubId: string) {
    const result = await this.clubsService.getSports(clubId);
    return ApiResponse.success(result, 'Club sports retrieved successfully');
  }

  @Put(':id/sports')
  @RequireClubRole(ClubRole.ADMIN)
  @UseGuards(ClubRoleGuard)
  async updateSports(
    @Param('id', ParseUUIDPipe) clubId: string,
    @Body() updateSportsDto: UpdateSportsDto,
  ) {
    const result = await this.clubsService.updateSports(clubId, updateSportsDto.sportIds);
    return ApiResponse.success(result, 'Club sports updated successfully');
  }
}
