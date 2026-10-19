import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import {
  IOAuthProviderStrategy,
  OAuthUserProfile,
} from '../interfaces/oauth-provider.interface';

@Injectable()
export class GoogleOAuthStrategy implements IOAuthProviderStrategy {
  readonly provider = 'google';
  private readonly logger = new Logger(GoogleOAuthStrategy.name);

  constructor(private readonly configService: ConfigService) {}

  async verifyToken(
    idToken: string,
    fallbackInfo?: { firstName?: string; lastName?: string },
  ): Promise<OAuthUserProfile> {
    try {
      const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
      const audiences = [
        clientId,
        this.configService.get<string>('GOOGLE_CLIENT_ID_IOS'),
        this.configService.get<string>('GOOGLE_CLIENT_ID_ANDROID'),
        this.configService.get<string>('GOOGLE_CLIENT_ID_WEB'),
      ].filter((a): a is string => Boolean(a));

      this.logger.log(
        `Validation réelle Google avec Audiences autorisées: ${JSON.stringify(audiences)}`,
      );
      const client = new OAuth2Client(clientId);

      const ticket = await client.verifyIdToken({
        idToken,
        audience: audiences.length > 0 ? audiences : undefined,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.sub) {
        throw new UnauthorizedException('Payload Google idToken invalide');
      }

      this.logger.log(`Jeton Google validé avec succès ! Email: ${payload.email}`);

      let firstName = fallbackInfo?.firstName;
      let lastName = fallbackInfo?.lastName;
      if (payload.given_name && !firstName) firstName = payload.given_name;
      if (payload.family_name && !lastName) lastName = payload.family_name;

      return {
        providerId: payload.sub,
        email: payload.email,
        firstName,
        lastName,
      };
    } catch (e: any) {
      this.logger.error(`Authentification Google échouée: ${e?.message || e}`);
      throw new UnauthorizedException(
        'Authentification Google échouée: ' + (e?.message || e),
      );
    }
  }
}
