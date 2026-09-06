import { IsNotEmpty, IsOptional, IsString, Length, Matches, IsUrl, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CoordsDto } from '../../users/dto/update-profile.dto';

export class CreateClubDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Handle must only contain alphanumeric characters, underscores, and dashes',
  })
  handle: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @IsUrl()
  coverUrl?: string;

  @IsOptional()
  @IsString()
  baseName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordsDto)
  coords?: CoordsDto;
}
