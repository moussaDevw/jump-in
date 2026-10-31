import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class SendEmailOtpDto {
  @ApiProperty({
    example: 'coureur@example.com',
    description: 'Adresse e-mail valide pour recevoir le code de vérification à 6 chiffres',
  })
  @IsEmail({}, { message: 'Veuillez renseigner une adresse e-mail valide' })
  @IsNotEmpty({ message: "L'adresse e-mail est obligatoire" })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;
}

