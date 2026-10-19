import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PlatformType } from '@prisma/client';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  pushToken!: string;

  @IsEnum(PlatformType)
  platform!: PlatformType;
}
