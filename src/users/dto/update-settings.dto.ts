import { IsOptional, IsBoolean } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsBoolean()
  ecoData?: boolean;

  @IsOptional()
  @IsBoolean()
  notifEnabled?: boolean;
}
