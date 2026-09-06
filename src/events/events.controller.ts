import { Controller, Get, Post, Patch, Body, Param, Query, HttpCode, HttpStatus, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { FindAllEventsDto } from './dto/find-all-events.dto';
import { EventOrganizerGuard } from './guards/event-organizer.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/dto/api-response.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async findAll(@Query() query: FindAllEventsDto) {
    const result = await this.eventsService.findAll(query);
    return ApiResponse.success(result, 'Events retrieved successfully');
  }

  @Get('mine')
  async findMine(@CurrentUser('id') userId: string) {
    const result = await this.eventsService.findMine(userId);
    return ApiResponse.success(result, 'My events retrieved successfully');
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('id') userId: string,
    @Body() createEventDto: CreateEventDto,
  ) {
    const result = await this.eventsService.create(userId, createEventDto);
    return ApiResponse.success(result, 'Event created successfully');
  }

  @Get('share/:slug')
  async findByShareSlug(@Param('slug') slug: string) {
    const result = await this.eventsService.findByShareSlug(slug);
    return ApiResponse.success(result, 'Event retrieved by share slug successfully');
  }

  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.eventsService.findOne(id);
    return ApiResponse.success(result, 'Event retrieved successfully');
  }

  @Patch(':id')
  @UseGuards(EventOrganizerGuard)
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() updateEventDto: UpdateEventDto,
  ) {
    const result = await this.eventsService.update(id, userId, updateEventDto);
    return ApiResponse.success(result, 'Event updated successfully');
  }

  @Patch(':id/publish')
  @UseGuards(EventOrganizerGuard)
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.eventsService.publish(id);
    return ApiResponse.success(result, 'Event published successfully');
  }

  @Patch(':id/cancel')
  @UseGuards(EventOrganizerGuard)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.eventsService.cancel(id);
    return ApiResponse.success(result, 'Event cancelled successfully');
  }
}
