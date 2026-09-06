import { Controller, Post, Delete, Get, Param, Query, Body, HttpCode, HttpStatus, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { RegistrationsService } from './registrations.service';
import { ScanTicketDto } from './dto/scan-ticket.dto';
import { EventOrganizerGuard } from '../guards/event-organizer.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ApiResponse } from '../../common/dto/api-response.dto';

@Controller('events')
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  /**
   * POST /events/:id/register — Register the current user for an event.
   */
  @Post(':id/register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.registrationsService.register(id, userId);
    return ApiResponse.success(result, 'Successfully registered for event');
  }

  /**
   * DELETE /events/:id/register — Cancel the current user's registration.
   */
  @Delete(':id/register')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.registrationsService.cancel(id, userId);
    return ApiResponse.success(result, 'Registration cancelled successfully');
  }

  /**
   * GET /events/:id/participants — List participants of an event.
   */
  @Get(':id/participants')
  async getParticipants(@Param('id', ParseUUIDPipe) id: string) {
    const result = await this.registrationsService.getEventParticipants(id);
    return ApiResponse.success(result, 'Participants retrieved successfully');
  }

  /**
   * POST /events/:id/registrations/:registrationId/check-in — Toggle check-in status of a participant.
   */
  @Post(':id/registrations/:registrationId/check-in')
  @UseGuards(EventOrganizerGuard)
  @HttpCode(HttpStatus.OK)
  async toggleCheckIn(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.registrationsService.toggleCheckIn(id, registrationId, userId);
    return ApiResponse.success(result, 'Participant check-in status updated successfully');
  }

  /**
   * POST /events/:id/check-in/scan — Check-in a participant by scanning their QR code / ticket code.
   */
  @Post(':id/check-in/scan')
  @UseGuards(EventOrganizerGuard)
  @HttpCode(HttpStatus.OK)
  async scanTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScanTicketDto,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.registrationsService.scanTicket(id, dto.ticketCode, userId);
    return ApiResponse.success(result, result.message);
  }

  /**
   * GET /events/:id/registration-status — Check if current user is registered.
   */
  @Get(':id/registration-status')
  async getRegistrationStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.registrationsService.getRegistrationStatus(id, userId);
    return ApiResponse.success(result, 'Registration status retrieved');
  }

  /**
   * GET /events/registrations/mine — Get the current user's registrations (agenda).
   * Optional query param: ?type=upcoming|past
   */
  @Get('registrations/mine')
  async getMyRegistrations(
    @CurrentUser('id') userId: string,
    @Query('type') type?: 'upcoming' | 'past',
  ) {
    const result = await this.registrationsService.getMyRegistrations(userId, type);
    return ApiResponse.success(result, 'My registrations retrieved successfully');
  }
}

