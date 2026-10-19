import { IsOptional, IsUUID, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class FindAllEventsDto {
  @IsOptional()
  @IsUUID()
  sportId?: string;

  @IsOptional()
  @IsUUID()
  clubId?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  dateFilter?: 'today' | 'weekend' | 'week' | 'month' | string;

  @IsOptional()
  @IsString()
  price?: 'free' | 'paid' | 'all' | string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
