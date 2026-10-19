import { IsOptional, IsString, IsNumber, IsUUID, IsBoolean, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class FeedQueryDto {
  @IsOptional()
  @IsUUID()
  sportId?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

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
