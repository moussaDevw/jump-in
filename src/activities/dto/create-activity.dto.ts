import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsInt,
  IsNumber,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActivitySource, ActivityVisibility } from '@prisma/client';

export class CreateActivityDto {
  @ApiPropertyOptional({
    description: 'Titre de l’activité',
    example: 'Course matinale sur la Corniche',
    maxLength: 120,
  })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'Description ou notes personnelles sur la sortie',
    example: 'Bonne séance rythmée avec un vent frais.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'ID du sport associé (UUID)',
    example: 'c3f6e1f0-466d-4bfa-bdc2-63b15ad4e022',
  })
  @IsUUID()
  @IsOptional()
  sportId?: string;

  @ApiPropertyOptional({
    description: 'Slug ou identifiant du sport (ex: running, walking, trail, cycling)',
    example: 'running',
  })
  @IsString()
  @IsOptional()
  sport?: string;

  @ApiPropertyOptional({
    description: 'Origine de l’enregistrement',
    enum: ActivitySource,
    default: ActivitySource.IN_APP_TRACKER,
  })
  @IsEnum(ActivitySource)
  @IsOptional()
  source?: ActivitySource;

  @ApiPropertyOptional({
    description: 'Identifiant unique externe pour la déduplication Apple Santé / Santé Connect',
    example: 'apple-workout-12345678',
  })
  @IsString()
  @IsOptional()
  externalId?: string;

  @ApiProperty({
    description: 'Date et heure de début de la session (ISO 8601)',
    example: '2026-10-19T07:30:00.000Z',
  })
  @IsDateString()
  startedAt: string;

  @ApiProperty({
    description: 'Date et heure de fin de la session (ISO 8601)',
    example: '2026-10-19T08:15:00.000Z',
  })
  @IsDateString()
  endedAt: string;

  @ApiProperty({
    description: 'Durée totale en secondes',
    example: 2700,
  })
  @IsInt()
  @Min(1)
  durationSeconds: number;

  @ApiProperty({
    description: 'Distance totale parcourue en mètres',
    example: 8500,
  })
  @IsNumber()
  @Min(0)
  distanceMeters: number;

  @ApiPropertyOptional({
    description: 'Distance totale en kilomètres (calculée automatiquement si omise)',
    example: 8.5,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  distanceKm?: number;

  @ApiPropertyOptional({
    description: 'Allure moyenne en secondes par kilomètre (ex: 318 pour 5:18 /km)',
    example: 318,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  avgPaceSecPerKm?: number;

  @ApiPropertyOptional({
    description: 'Calories actives brûlées (kcal)',
    example: 540,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  caloriesBurned?: number;

  @ApiPropertyOptional({
    description: 'Dénivelé positif cumulé (mètres)',
    example: 45.5,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  elevationGainMeters?: number;

  @ApiPropertyOptional({
    description: 'Fréquence cardiaque moyenne (bpm)',
    example: 152,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  avgHeartRate?: number;

  @ApiPropertyOptional({
    description: 'Fréquence cardiaque maximale (bpm)',
    example: 178,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  maxHeartRate?: number;

  @ApiPropertyOptional({
    description: 'Tracé GPS compressé (Google Polyline format)',
    example: '_p~iF~ps|U_ulLnnqC_mqN...',
  })
  @IsString()
  @IsOptional()
  polyline?: string;

  @ApiPropertyOptional({
    description: 'Niveau de visibilité de l’activité',
    enum: ActivityVisibility,
    default: ActivityVisibility.PUBLIC,
  })
  @IsEnum(ActivityVisibility)
  @IsOptional()
  visibility?: ActivityVisibility;
}
