import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateSportDto {
  @IsOptional()
  @IsString()
  labelFr?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'Color must be a valid hex color code (e.g., #FF5733)',
  })
  color?: string;
}
