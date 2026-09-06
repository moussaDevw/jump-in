import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { SportsService } from './sports.service';
import { CreateSportDto } from './dto/create-sport.dto';
import { UpdateSportDto } from './dto/update-sport.dto';
import { Admin } from '../common/decorators/admin.decorator';
import { ApiResponse } from '../common/dto/api-response.dto';

@Controller('sports')
export class SportsController {
  constructor(private readonly sportsService: SportsService) {}

  @Get()
  async findAll() {
    const result = await this.sportsService.findAll();
    return ApiResponse.success(result, 'Sports list retrieved successfully');
  }

  @Admin()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() createSportDto: CreateSportDto) {
    const result = await this.sportsService.create(createSportDto);
    return ApiResponse.success(result, 'Sport created successfully');
  }

  @Admin()
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSportDto: UpdateSportDto,
  ) {
    const result = await this.sportsService.update(id, updateSportDto);
    return ApiResponse.success(result, 'Sport updated successfully');
  }

  @Admin()
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.sportsService.delete(id);
    return ApiResponse.success(result, 'Sport deleted successfully');
  }
}
