import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class VerifyOAuthDto {
  @IsEnum(['google', 'apple'])
  provider: 'google' | 'apple';

  @IsString()
  @IsNotEmpty()
  idToken: string;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;
}
