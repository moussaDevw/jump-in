import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateSportDto {
  @IsNotEmpty()
  @IsString()
  labelFr: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'La couleur doit être un code hexadécimal valide (ex: #FF5733)',
  })
  color: string;
}
