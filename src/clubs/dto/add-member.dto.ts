import { IsNotEmpty, IsUUID, IsEnum, IsOptional } from 'class-validator';
import { ClubRole } from '@prisma/client';

export class AddMemberDto {
  @IsNotEmpty()
  @IsUUID('4')
  userId: string;

  @IsOptional()
  @IsEnum(ClubRole)
  role: ClubRole = ClubRole.MEMBER;
}
