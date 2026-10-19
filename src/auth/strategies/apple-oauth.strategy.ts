import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import appleSignin from 'apple-signin-auth';
import {
  IOAuthProviderStrategy,
  OAuthUserProfile,
} from '../interfaces/oauth-provider.interface';

@Injectable()
export class AppleOAuthStrategy implements IOAuthProviderStrategy {
  readonly provider = 'apple';
  private readonly logger = new Logger(AppleOAuthStrategy.name);

  constructor(private readonly configService: ConfigService) {}

  async verifyToken(
    idToken: string,
    fallbackInfo?: { firstName?: string; lastName?: string },
  ): Promise<OAuthUserProfile> {
    try {
      const bundleId =
        this.configService.get<string>('APPLE_CLIENT_ID') || 'com.jumpin.app';
      this.logger.log(`Validation réelle Apple pour bundleId: ${bundleId}`);

      const result = await appleSignin.verifyIdToken(idToken, {
        audience: bundleId,
        ignoreExpiration: false,
      });

      this.logger.log(`Jeton Apple validé avec succès ! Email: ${result.email}`);

      return {
        providerId: result.sub,
        email: result.email,
        firstName: fallbackInfo?.firstName,
        lastName: fallbackInfo?.lastName,
      };
    } catch (e: any) {
      this.logger.error(`Authentification Apple échouée: ${e?.message || e}`);
      throw new UnauthorizedException(
        'Authentification Apple échouée: ' + (e?.message || e),
      );
    }
  }
}
