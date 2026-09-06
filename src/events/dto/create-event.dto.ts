import { IsNotEmpty, IsOptional, IsString, IsUUID, IsUrl, IsDateString, IsInt, Min, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EventVisibility } from '@prisma/client';
import { CoordsDto } from '../../users/dto/update-profile.dto';

export class CreateEventDto {
  @IsNotEmpty()
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNotEmpty()
  @IsUUID()
  sportId: string;

  @IsOptional()
  @IsUUID()
  clubId?: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  coverUrl?: string;

  @IsNotEmpty()
  @IsDateString()
  startsAt: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsString()
  venueName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordsDto)
  coords?: CoordsDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(EventVisibility)
  visibility?: EventVisibility;

  @IsOptional()
  @IsString()
  googlePlaceId?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;
}
