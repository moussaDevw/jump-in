import { Controller, Post, Delete, Param, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ClubFollowsService } from './club-follows.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/dto/api-response.dto';

@Controller('clubs')
export class ClubFollowsController {
  constructor(private readonly clubFollowsService: ClubFollowsService) {}

  @Post(':id/follow')
  @HttpCode(HttpStatus.OK)
  async follow(
    @Param('id', ParseUUIDPipe) clubId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.clubFollowsService.follow(clubId, userId);
    return ApiResponse.success(result, 'Followed club successfully');
  }

  @Delete(':id/follow')
  @HttpCode(HttpStatus.OK)
  async unfollow(
    @Param('id', ParseUUIDPipe) clubId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.clubFollowsService.unfollow(clubId, userId);
    return ApiResponse.success(result, 'Unfollowed club successfully');
  }
}
