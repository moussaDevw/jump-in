import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { UploadService } from './upload.service';
import { GetPresignedUrlDto } from './dto/get-presigned-url.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/dto/api-response.dto';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('presigned-url')
  @HttpCode(HttpStatus.OK)
  async getPresignedUrl(
    @CurrentUser('id') userId: string,
    @Body() getPresignedUrlDto: GetPresignedUrlDto,
  ) {
    const result = await this.uploadService.getPresignedUploadUrl(userId, getPresignedUrlDto);
    return ApiResponse.success(result, 'Presigned upload URL generated successfully');
  }
}
