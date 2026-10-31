import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class VerifyEmailOtpDto {
  @ApiProperty({
    example: 'coureur@example.com',
    description: 'Adresse e-mail du compte',
  })
  @IsEmail({}, { message: 'Veuillez renseigner une adresse e-mail valide' })
  @IsNotEmpty({ message: "L'adresse e-mail est obligatoire" })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({
    example: '482910',
    description: 'Code de vérification à 6 chiffres reçu par e-mail',
  })
  @IsString({ message: 'Le code doit être une chaîne de caractères' })
  @IsNotEmpty({ message: 'Le code de vérification est obligatoire' })
  @Length(6, 6, { message: 'Le code doit comporter exactement 6 chiffres' })
  @Matches(/^[0-9]{6}$/, { message: 'Le code doit être composé uniquement de 6 chiffres' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  code: string;
}

