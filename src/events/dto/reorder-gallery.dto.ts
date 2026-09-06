import { IsArray, IsUUID } from 'class-validator';

export class ReorderGalleryDto {
  @IsArray()
  @IsUUID('4', { each: true, message: 'Each gallery photo ID must be a valid UUID v4' })
  photoIds: string[];
}
