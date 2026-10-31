import { IsEnum, IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';
import { PlatformType } from '@prisma/client';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  pushToken!: string;

  @IsEnum(PlatformType)
  platform!: PlatformType;

  @IsOptional()
  @IsString()
  @IsIn(['fr', 'en'])
  locale?: string;
}
