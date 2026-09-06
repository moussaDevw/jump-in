import { Controller, Post, Delete, Param, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { InteractionsService } from './interactions.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('events')
export class LikesController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  async like(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.interactionsService.like(id, userId);
    return ApiResponse.success(result, 'Event liked successfully');
  }

  @Delete(':id/like')
  @HttpCode(HttpStatus.OK)
  async unlike(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.interactionsService.unlike(id, userId);
    return ApiResponse.success(result, 'Event unliked successfully');
  }
}
