import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { GalleryService } from './gallery.service';
import { AddPhotoDto } from '../dto/add-photo.dto';
import { ReorderGalleryDto } from '../dto/reorder-gallery.dto';
import { EventOrganizerGuard } from '../guards/event-organizer.guard';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('events')
export class GalleryController {
  constructor(private readonly galleryService: GalleryService) {}

  @Get(':id/gallery')
  async getGallery(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.galleryService.getGallery(id);
    return ApiResponse.success(result, 'Gallery photos retrieved successfully');
  }

  @Post(':id/gallery')
  @UseGuards(EventOrganizerGuard)
  @HttpCode(HttpStatus.CREATED)
  async addPhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() addPhotoDto: AddPhotoDto,
  ) {
    const result = await this.galleryService.addPhoto(id, addPhotoDto.url);
    return ApiResponse.success(result, 'Photo added to gallery successfully');
  }

  @Delete(':id/gallery/:photoId')
  @UseGuards(EventOrganizerGuard)
  @HttpCode(HttpStatus.OK)
  async deletePhoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('photoId', ParseUUIDPipe) photoId: string,
  ) {
    const result = await this.galleryService.deletePhoto(id, photoId);
    return ApiResponse.success(result, 'Photo deleted from gallery successfully');
  }

  @Patch(':id/gallery/reorder')
  @UseGuards(EventOrganizerGuard)
  @HttpCode(HttpStatus.OK)
  async reorderGallery(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() reorderGalleryDto: ReorderGalleryDto,
  ) {
    const result = await this.galleryService.reorderGallery(id, reorderGalleryDto.photoIds);
    return ApiResponse.success(result, 'Gallery reordered successfully');
  }
}
