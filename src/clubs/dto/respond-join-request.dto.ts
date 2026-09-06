import { IsEnum, IsNotEmpty } from 'class-validator';
import { JoinRequestStatus } from '@prisma/client';

export class RespondJoinRequestDto {
  @IsNotEmpty()
  @IsEnum(JoinRequestStatus)
  status: JoinRequestStatus;
}
