import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { VerifyOAuthDto } from './dto/verify-oauth.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ApiResponse } from '../common/dto/api-response.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ short: { limit: 3, ttl: 1000 }, long: { limit: 10, ttl: 60000 } })
  @Post('oauth/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOAuth(@Body() verifyOAuthDto: VerifyOAuthDto) {
    const result = await this.authService.verifyOAuth(verifyOAuthDto);
    return ApiResponse.success(result, 'Authentification OAuth réussie');
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    const result = await this.authService.refreshTokens(refreshTokenDto.refreshToken);
    return ApiResponse.success(result, 'Tokens rafraîchis avec succès');
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@CurrentUser('id') userId: string) {
    const result = await this.authService.logout(userId);
    return ApiResponse.success(result, 'Déconnecté avec succès');
  }
}
