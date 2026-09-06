import { Controller, Get, Query } from '@nestjs/common';
import { LocationService } from './location.service';
import { ApiResponse } from '../common/dto/api-response.dto';

@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('autocomplete')
  async autocomplete(@Query('input') input: string) {
    const result = await this.locationService.autocomplete(input);
    return ApiResponse.success(result, 'Suggestions retrieved successfully');
  }

  @Get('details')
  async getDetails(@Query('placeId') placeId: string) {
    const result = await this.locationService.getDetails(placeId);
    return ApiResponse.success(result, 'Place details retrieved successfully');
  }
}
