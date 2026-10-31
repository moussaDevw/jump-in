import { IsOptional, IsBoolean, IsString, IsIn } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  ecoData?: boolean;

  @IsOptional()
  @IsBoolean()
  notifEnabled?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['fr', 'en'])
  locale?: string;
}
