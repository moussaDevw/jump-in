import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { SearchClubsDto } from './dto/search-clubs.dto';
import { ApiResponse } from '../common/dto/api-response.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('clubs')
  async searchClubs(@Query() dto: SearchClubsDto) {
    const result = await this.searchService.searchClubs(dto);
    return ApiResponse.success(result, 'Clubs search completed successfully');
  }
}
