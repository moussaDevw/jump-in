import { Controller, Get, Patch, Put, Delete, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateSportsDto } from './dto/update-sports.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/dto/api-response.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMe(@CurrentUser('id') userId: string) {
    const result = await this.usersService.getMe(userId);
    return ApiResponse.success(result, 'Profile retrieved successfully');
  }

  @Patch('me')
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const result = await this.usersService.updateProfile(userId, updateProfileDto);
    return ApiResponse.success(result, 'Profile updated successfully');
  }

  @Patch('me/location')
  async updateLocation(
    @CurrentUser('id') userId: string,
    @Body() updateLocationDto: UpdateLocationDto,
  ) {
    const result = await this.usersService.updateLocation(userId, updateLocationDto);
    return ApiResponse.success(result, 'Location updated successfully');
  }

  @Patch('me/settings')
  async updateSettings(
    @CurrentUser('id') userId: string,
    @Body() updateSettingsDto: UpdateSettingsDto,
  ) {
    const result = await this.usersService.updateSettings(userId, updateSettingsDto);
    return ApiResponse.success(result, 'Settings updated successfully');
  }

  @Get('me/sports')
  async getMySports(@CurrentUser('id') userId: string) {
    const result = await this.usersService.getSports(userId);
    return ApiResponse.success(result, 'Sports list retrieved successfully');
  }

  @Get('me/clubs')
  async getMyClubs(@CurrentUser('id') userId: string) {
    const result = await this.usersService.getMyClubs(userId);
    return ApiResponse.success(result, 'Clubs list retrieved successfully');
  }

  @Put('me/sports')
  async updateMySports(
    @CurrentUser('id') userId: string,
    @Body() updateSportsDto: UpdateSportsDto,
  ) {
    const result = await this.usersService.updateSports(userId, updateSportsDto.sportIds);
    return ApiResponse.success(result, 'Sports list updated successfully');
  }

  @Get(':id')
  async getPublicProfile(@Param('id', ParseUUIDPipe) targetId: string) {
    const result = await this.usersService.getPublicProfile(targetId);
    return ApiResponse.success(result, 'Public profile retrieved successfully');
  }

  @Delete('me')
  @HttpCode(HttpStatus.OK)
  async deleteAccount(@CurrentUser('id') userId: string) {
    const result = await this.usersService.softDelete(userId);
    return ApiResponse.success(result, 'Account deleted successfully');
  }
}
