import { IsOptional, IsInt, Min, Max, IsUUID, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryActivitiesDto {
  @ApiPropertyOptional({
    description: 'Nombre d’activités à retourner (max 50)',
    default: 20,
    minimum: 1,
    maximum: 50,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Curseur pour la pagination (ID de la dernière activité)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Filtrer par ID de sport (UUID)',
    example: 'c3f6e1f0-466d-4bfa-bdc2-63b15ad4e022',
  })
  @IsOptional()
  @IsUUID()
  sportId?: string;

  @ApiPropertyOptional({
    description: 'Filtrer à partir d’une date (ISO 8601)',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Filtrer jusqu’à une date (ISO 8601)',
    example: '2026-10-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
