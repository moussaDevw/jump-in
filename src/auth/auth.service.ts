import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import appleSignin from 'apple-signin-auth';
import { VerifyOAuthDto } from './dto/verify-oauth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Vérifie le token OAuth (Google ou Apple), trouve ou crée le User et retourne les tokens JWT.
   */
  async verifyOAuth(dto: VerifyOAuthDto) {
    this.logger.log(`Provider reçu: "${dto.provider}", idToken (début): "${dto.idToken.substring(0, 20)}..."`);
    
    let providerId: string;
    let email: string | undefined;
    let firstName = dto.firstName;
    let lastName = dto.lastName;

    if (dto.provider === 'google') {
      try {
        const clientId = this.configService.get('GOOGLE_CLIENT_ID');
        const audiences = [
          clientId,
          this.configService.get('GOOGLE_CLIENT_ID_IOS'),
          this.configService.get('GOOGLE_CLIENT_ID_ANDROID'),
          this.configService.get('GOOGLE_CLIENT_ID_WEB'),
        ].filter((a): a is string => Boolean(a));

        this.logger.log(`Validation réelle avec Audiences autorisées: ${JSON.stringify(audiences)}`);
        const client = new OAuth2Client(clientId);

        const ticket = await client.verifyIdToken({
          idToken: dto.idToken,
          audience: audiences.length > 0 ? audiences : undefined,
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.sub) {
          throw new UnauthorizedException('Payload Google idToken invalide');
        }
        this.logger.log(`Jeton validé avec succès ! Payload email: ${payload.email}`);
        providerId = payload.sub;
        email = payload.email;
        if (payload.given_name && !firstName) firstName = payload.given_name;
        if (payload.family_name && !lastName) lastName = payload.family_name;
      } catch (e: any) {
        this.logger.error(`Authentification Google échouée: ${e?.message || e}`);
        throw new UnauthorizedException('Authentification Google échouée: ' + (e?.message || e));
      }
    } else if (dto.provider === 'apple') {
      try {
        const bundleId = this.configService.get('APPLE_CLIENT_ID') || 'com.jumpin.app';
        this.logger.log(`Validation réelle pour bundleId: ${bundleId}`);
        const result = await appleSignin.verifyIdToken(dto.idToken, {
          audience: bundleId,
          ignoreExpiration: false,
        });
        this.logger.log(`Jeton validé avec succès ! Email: ${result.email}`);
        providerId = result.sub;
        email = result.email;
      } catch (e: any) {
        this.logger.error(`Authentification Apple échouée: ${e?.message || e}`);
        throw new UnauthorizedException('Authentification Apple échouée: ' + (e?.message || e));
      }
    } else {
      throw new BadRequestException('Provider non supporté');
    }

    // 1. Chercher si l'identité OAuth existe déjà
    let identity = await this.prisma.userIdentity.findUnique({
      where: {
        provider_providerId: {
          provider: dto.provider,
          providerId: providerId,
        },
      },
      include: { user: true },
    });

    let user = identity?.user;

    // 2. Si pas d'identité mais un email est renvoyé, vérifier si un User existe avec cet email
    if (!user && email) {
      user = await this.prisma.user.findUnique({
        where: { email },
      }) || undefined;
    }

    if (!user) {
      // 3. Création du nouvel utilisateur avec son identité OAuth
      user = await this.prisma.user.create({
        data: {
          email: email || null,
          firstName: firstName || null,
          lastName: lastName || null,
          onboardingCompleted: false,
          identities: {
            create: {
              provider: dto.provider,
              providerId: providerId,
              email: email || null,
            },
          },
        },
      });
    } else if (!identity) {
      // 4. Le User existe (ex: via un autre provider ou email) mais pas encore cette identité -> la lier
      await this.prisma.userIdentity.create({
        data: {
          userId: user.id,
          provider: dto.provider,
          providerId: providerId,
          email: email || null,
        },
      });
    }

    // Génération des tokens JWT
    const tokens = await this.generateTokens(user.id, user.email, user.username);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(`Connexion réussie pour User ID=${user.id}, email=${user.email}`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        onboardingCompleted: user.onboardingCompleted,
      },
    };
  }

  /**
   * Refreshes the access token using a valid refresh token.
   */
  async refreshTokens(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.refreshHash) {
        throw new UnauthorizedException('Access denied or user not found');
      }

      const isMatch = await bcrypt.compare(refreshToken, user.refreshHash);
      if (!isMatch) {
        throw new UnauthorizedException('Access Denied');
      }

      const tokens = await this.generateTokens(user.id, user.email, user.username);
      await this.updateRefreshToken(user.id, tokens.refreshToken);

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          onboardingCompleted: user.onboardingCompleted,
        },
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Logs out the user by clearing the stored refresh token hash.
   */
  async logout(userId: string): Promise<{ success: boolean }> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshHash: null },
    });
    return { success: true };
  }

  // --- Helpers ---

  private async generateTokens(userId: string, email: string | null, username: string | null) {
    const payload = { sub: userId, email, username };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.configService.get<any>('JWT_ACCESS_EXPIRES_IN') || '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.configService.get<any>('JWT_REFRESH_EXPIRES_IN') || '30d',
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hash = await bcrypt.hash(refreshToken, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshHash: hash },
    });
  }
}
