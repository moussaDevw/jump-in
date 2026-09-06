import { IsArray, IsUUID } from 'class-validator';

export class UpdateSportsDto {
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each sport ID must be a valid UUID v4' })
  sportIds: string[];
}
