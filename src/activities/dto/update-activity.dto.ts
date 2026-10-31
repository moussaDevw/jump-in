import { IsString, IsOptional, MaxLength, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ActivityVisibility } from '@prisma/client';

export class UpdateActivityDto {
  @ApiPropertyOptional({
    description: 'Nouveau titre pour l’activité',
    example: 'Sortie longue dominicale',
    maxLength: 120,
  })
  @IsString()
  @MaxLength(120)
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'Nouvelle description',
    example: 'Dernière sortie avant le marathon.',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Nouveau niveau de visibilité',
    enum: ActivityVisibility,
    example: ActivityVisibility.PUBLIC,
  })
  @IsEnum(ActivityVisibility)
  @IsOptional()
  visibility?: ActivityVisibility;
}
