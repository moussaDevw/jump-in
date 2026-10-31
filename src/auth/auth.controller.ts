import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { VerifyOAuthDto } from './dto/verify-oauth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { SendEmailOtpDto } from './dto/send-email-otp.dto';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/dto/api-response.dto';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ short: { limit: 3, ttl: 1000 }, long: { limit: 10, ttl: 60000 } })
  @Post('oauth/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Connexion ou inscription via OAuth (Google ou Apple)' })
  async verifyOAuth(@Body() verifyOAuthDto: VerifyOAuthDto) {
    const result = await this.authService.verifyOAuth(verifyOAuthDto);
    return ApiResponse.success(result, 'Authentification OAuth réussie');
  }

  @Public()
  @Throttle({ short: { limit: 2, ttl: 1000 }, long: { limit: 5, ttl: 60000 } })
  @Post('email/send-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Envoie un code de vérification à 6 chiffres par e-mail' })
  async sendEmailCode(@Body() sendEmailOtpDto: SendEmailOtpDto) {
    const result = await this.authService.sendEmailOtp(sendEmailOtpDto);
    return ApiResponse.success(result, result.message);
  }

  @Public()
  @Throttle({ short: { limit: 3, ttl: 1000 }, long: { limit: 10, ttl: 60000 } })
  @Post('email/verify-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vérifie le code OTP et connecte / crée le compte' })
  async verifyEmailCode(@Body() verifyEmailOtpDto: VerifyEmailOtpDto) {
    const result = await this.authService.verifyEmailOtp(verifyEmailOtpDto);
    return ApiResponse.success(
      result,
      result.isNewUser ? 'Compte créé avec succès' : 'Connexion réussie'
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rafraîchit les jetons JWT' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    const result = await this.authService.refreshTokens(refreshTokenDto.refreshToken);
    return ApiResponse.success(result, 'Tokens rafraîchis avec succès');
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Déconnecte la session active' })
  async logout(@CurrentUser('id') userId: string) {
    const result = await this.authService.logout(userId);
    return ApiResponse.success(result, 'Déconnecté avec succès');
  }
}
