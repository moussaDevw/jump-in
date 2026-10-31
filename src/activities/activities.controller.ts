import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { QueryActivitiesDto } from './dto/query-activities.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/dto/api-response.dto';

@ApiTags('Activities')
@ApiBearerAuth('JWT-auth')
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  /**
   * POST /activities — Record a newly completed activity.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enregistrer une nouvelle activité sportive',
    description:
      'Enregistre une séance terminée (depuis le Live Tracker in-app, Apple Santé ou Santé Connect). Dédupliqué automatiquement via externalId.',
  })
  @SwaggerResponse({
    status: HttpStatus.CREATED,
    description: 'Activité enregistrée avec succès.',
  })
  @SwaggerResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Données de session invalides.',
  })
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateActivityDto,
  ) {
    const result = await this.activitiesService.create(userId, dto);
    return ApiResponse.success(result, 'Activité enregistrée avec succès');
  }

  /**
   * GET /activities/me — Get authenticated user's activities history.
   */
  @Get('me')
  @ApiOperation({
    summary: 'Récupérer l’historique des activités de l’utilisateur connecté',
    description: 'Retourne la liste paginée par curseur des activités.',
  })
  @SwaggerResponse({
    status: HttpStatus.OK,
    description: 'Historique des activités récupéré.',
  })
  async findMyActivities(
    @CurrentUser('id') userId: string,
    @Query() query: QueryActivitiesDto,
  ) {
    const result = await this.activitiesService.findMyActivities(userId, query);
    return ApiResponse.success(result, 'Activités récupérées avec succès');
  }

  /**
   * GET /activities/me/stats — Get aggregated stats (weekly, monthly, total km).
   */
  @Get('me/stats')
  @ApiOperation({
    summary: 'Récupérer les statistiques cumulées d’activité',
    description:
      'Calcule le volume hebdomadaire (km de la semaine), mensuel (km du mois), et totaux historiques (distance, allure, calories, durée).',
  })
  @SwaggerResponse({
    status: HttpStatus.OK,
    description: 'Statistiques agrégées récupérées.',
  })
  async getMyStats(@CurrentUser('id') userId: string) {
    const result = await this.activitiesService.getUserStats(userId);
    return ApiResponse.success(result, 'Statistiques récupérées avec succès');
  }

  /**
   * GET /activities/:id — Get details of a single activity.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Consulter une activité par son identifiant',
    description:
      'Récupère les détails, le profil du coureur et le tracé polyline d’une activité (respecte la confidentialité publique/privée).',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'ID de l’activité',
  })
  @SwaggerResponse({
    status: HttpStatus.OK,
    description: 'Détails de l’activité retournés.',
  })
  @SwaggerResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Activité introuvable.',
  })
  @SwaggerResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Activité privée non accessible.',
  })
  async findById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.activitiesService.findById(id, userId);
    return ApiResponse.success(result, 'Détails de l’activité récupérés');
  }

  /**
   * PATCH /activities/:id — Update title, description or visibility.
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Modifier une activité (titre, description, visibilité)',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'ID de l’activité',
  })
  @SwaggerResponse({
    status: HttpStatus.OK,
    description: 'Activité mise à jour avec succès.',
  })
  @SwaggerResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Seul l’auteur peut modifier son activité.',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    const result = await this.activitiesService.update(id, userId, dto);
    return ApiResponse.success(result, 'Activité mise à jour avec succès');
  }

  /**
   * DELETE /activities/:id — Soft-delete an activity.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Supprimer une activité (soft-delete)',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'ID de l’activité',
  })
  @SwaggerResponse({
    status: HttpStatus.OK,
    description: 'Activité supprimée avec succès.',
  })
  @SwaggerResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Seul l’auteur peut supprimer son activité.',
  })
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
  ) {
    const result = await this.activitiesService.delete(id, userId);
    return ApiResponse.success(result, 'Activité supprimée avec succès');
  }
}
