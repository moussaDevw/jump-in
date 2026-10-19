import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchClubsDto } from './dto/search-clubs.dto';
import { SearchEventsDto } from './dto/search-events.dto';
import { SearchUsersDto } from './dto/search-users.dto';
import { ApiResponse } from '../common/dto/api-response.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Public()
  @Get('clubs')
  async searchClubs(@Query() dto: SearchClubsDto) {
    const result = await this.searchService.searchClubs(dto);
    return ApiResponse.success(result, 'Recherche de clubs réussie');
  }

  @Public()
  @Get('events')
  async searchEvents(@Query() dto: SearchEventsDto) {
    const result = await this.searchService.searchEvents(dto);
    return ApiResponse.success(result, 'Recherche d\'événements réussie');
  }

  @Public()
  @Get('users')
  async searchUsers(@Query() dto: SearchUsersDto) {
    const result = await this.searchService.searchUsers(dto);
    return ApiResponse.success(result, 'Recherche d\'utilisateurs réussie');
  }
}
