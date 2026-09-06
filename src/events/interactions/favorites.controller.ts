import { Controller, Post, Delete, Get, Param, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { InteractionsService } from './interactions.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('events')
export class FavoritesController {
  constructor(private readonly interactionsService: InteractionsService) {}

  /**
   * GET /events/favorites — List the current user's favorite events.
   * Must be placed BEFORE parameterized routes like :id to avoid conflicts.
   */
  @Get('favorites')
  async getUserFavorites(@CurrentUser('id') userId: string) {
    const result = await this.interactionsService.getUserFavorites(userId);
    return ApiResponse.success(result, 'Favorites retrieved successfully');
  }

  /**
   * GET /events/favorite-ids — Get just the event IDs the user has favorited (for quick status checks).
   */
  @Get('favorite-ids')
  async getUserFavoriteIds(@CurrentUser('id') userId: string) {
    const result = await this.interactionsService.getUserFavoriteIds(userId);
    return ApiResponse.success(result, 'Favorite IDs retrieved successfully');
  }

  @Post(':id/favorite')
  @HttpCode(HttpStatus.OK)
  async favorite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.interactionsService.favorite(id, userId);
    return ApiResponse.success(result, 'Event favorited successfully');
  }

  @Delete(':id/favorite')
  @HttpCode(HttpStatus.OK)
  async unfavorite(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.interactionsService.unfavorite(id, userId);
    return ApiResponse.success(result, 'Event unfavorited successfully');
  }
}
