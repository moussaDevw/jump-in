import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentProvider } from '@prisma/client';

export class InitiatePaymentDto {
  @ApiProperty({
    description: "ID de l'inscription (Registration) à régler",
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  registrationId: string;

  @ApiPropertyOptional({
    description:
      'Moyen de paiement Bictorys choisi à chaque transaction (wave_money, orange_money, card)',
    enum: PaymentProvider,
    example: PaymentProvider.wave_money,
  })
  @IsOptional()
  @IsEnum(PaymentProvider, {
    message:
      'provider doit être l’une des valeurs suivantes : wave_money, orange_money, card',
  })
  provider?: PaymentProvider;

  @ApiPropertyOptional({
    description:
      'Numéro de téléphone Mobile Money (format international ou local, ex: +221770000000)',
    example: '+221770000000',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{8,16}$/, {
    message: 'Format de numéro de téléphone invalide',
  })
  phone?: string;

  @ApiPropertyOptional({
    description:
      'Forcer le mode Hosted Checkout Bictorys (true) ou Direct API par payment_type (false). Si omis : Direct API si `provider` est fourni, sinon Hosted Checkout.',
  })
  @IsOptional()
  @IsBoolean()
  useHostedCheckout?: boolean;

  @ApiPropertyOptional({
    description:
      'URL de redirection autorisée après succès (schéma runhub:// ou domaine autorisé)',
    example: 'runhub://payment/success',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  successRedirectUrl?: string;

  @ApiPropertyOptional({
    description:
      'URL de redirection autorisée après échec (schéma runhub:// ou domaine autorisé)',
    example: 'runhub://payment/error',
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  errorRedirectUrl?: string;
}
