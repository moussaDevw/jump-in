import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class AddPhotoDto {
  @IsNotEmpty()
  @IsString()
  @IsUrl()
  url: string;
}
