import { IsOptional, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class NearbyFeedDto {
  @IsNumber()
  @Type(() => Number)
  lat: number;

  @IsNumber()
  @Type(() => Number)
  lng: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(500)
  @Max(100000)
  radius?: number = 20000; // 20km default

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true || value === '1' || value === 1)
  ecoData?: boolean;
}
