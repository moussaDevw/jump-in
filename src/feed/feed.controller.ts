import { Controller, Get, Query } from '@nestjs/common';
import { FeedService } from './feed.service';
import { FeedQueryDto } from './dto/feed-query.dto';
import { NearbyFeedDto } from './dto/nearby-feed.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/dto/api-response.dto';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  /**
   * Public discovery feed (chronological, published future events).
   */
  @Public()
  @Get()
  async getPublicFeed(@Query() query: FeedQueryDto) {
    const result = await this.feedService.getPublicFeed(query);
    return ApiResponse.success(result, 'Flux public récupéré avec succès');
  }

  /**
   * Nearby feed (geospatial distance ordering with PostGIS).
   */
  @Public()
  @Get('nearby')
  async getNearbyFeed(@Query() query: NearbyFeedDto) {
    const result = await this.feedService.getNearbyFeed(query);
    return ApiResponse.success(result, 'Flux de proximité récupéré avec succès');
  }

  /**
   * Personalized for-you feed (based on sports and club preferences).
   */
  @Get('for-you')
  async getForYouFeed(
    @CurrentUser('id') userId: string,
    @Query() query: FeedQueryDto,
  ) {
    const result = await this.feedService.getForYouFeed(userId, query);
    return ApiResponse.success(result, 'Flux personnalisé récupéré avec succès');
  }
}
