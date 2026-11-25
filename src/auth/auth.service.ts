import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { VerifyOAuthDto } from './dto/verify-oauth.dto';
import { SendEmailOtpDto } from './dto/send-email-otp.dto';
import { VerifyEmailOtpDto } from './dto/verify-email-otp.dto';
import { IOAuthProviderStrategy } from './interfaces/oauth-provider.interface';
import { GoogleOAuthStrategy } from './strategies/google-oauth.strategy';
import { AppleOAuthStrategy } from './strategies/apple-oauth.strategy';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly strategies = new Map<string, IOAuthProviderStrategy>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    googleStrategy: GoogleOAuthStrategy,
    appleStrategy: AppleOAuthStrategy,
  ) {
    this.strategies.set(googleStrategy.provider, googleStrategy);
    this.strategies.set(appleStrategy.provider, appleStrategy);
  }

  /**
   * Vérifie le token OAuth (Google ou Apple), trouve ou crée le User et retourne les tokens JWT.
   */
  async verifyOAuth(dto: VerifyOAuthDto) {
    this.logger.log(`Provider reçu: "${dto.provider}", idToken (début): "${dto.idToken.substring(0, 20)}..."`);

    const strategy = this.strategies.get(dto.provider);
    if (!strategy) {
      throw new BadRequestException(`Provider non supporté: ${dto.provider}`);
    }

    const { providerId, email, firstName, lastName } = await strategy.verifyToken(dto.idToken, {
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

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
      user = (await this.prisma.user.findUnique({
        where: { email },
      })) || undefined;
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
   * Envoie un code OTP à 6 chiffres par e-mail avec rate-limiting de renvoi (45s).
   */
  async sendEmailOtp(dto: SendEmailOtpDto) {
    const existing = await this.prisma.emailOtp.findUnique({
      where: { email: dto.email },
    });

    // Cooldown anti-spam : 45 secondes entre 2 demandes pour le même email
    if (existing) {
      const elapsedMs = Date.now() - existing.updatedAt.getTime();
      if (elapsedMs < 45 * 1000) {
        const remainingSeconds = Math.ceil((45 * 1000 - elapsedMs) / 1000);
        throw new BadRequestException(
          `Veuillez patienter ${remainingSeconds} seconde(s) avant de demander un nouveau code.`
        );
      }
    }

    // Code aléatoire cryptographiquement sécurisé à 6 chiffres
    const code = randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Valide 10 minutes

    await this.prisma.emailOtp.upsert({
      where: { email: dto.email },
      create: {
        email: dto.email,
        codeHash,
        expiresAt,
        attempts: 0,
      },
      update: {
        codeHash,
        expiresAt,
        attempts: 0,
      },
    });

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { locale: true },
    });
    const locale = (existingUser?.locale as 'fr' | 'en') || 'fr';

    await this.mailService.sendOtpCode(dto.email, code, locale);

    return {
      message: 'Un code de vérification à 6 chiffres a été envoyé à votre adresse e-mail.',
      expiresInSeconds: 600,
    };
  }

  /**
   * Vérifie le code OTP à 6 chiffres, crée ou connecte le User et retourne les tokens JWT.
   */
  async verifyEmailOtp(dto: VerifyEmailOtpDto) {
    const otpRecord = await this.prisma.emailOtp.findUnique({
      where: { email: dto.email },
    });

    if (!otpRecord) {
      throw new BadRequestException(
        'Aucun code actif pour cette adresse e-mail. Veuillez en demander un nouveau.'
      );
    }

    // Vérification expiration
    if (otpRecord.expiresAt.getTime() < Date.now()) {
      await this.prisma.emailOtp.delete({ where: { email: dto.email } }).catch(() => {});
      throw new BadRequestException(
        'Le code de vérification a expiré. Veuillez demander un nouveau code.'
      );
    }

    // Sécurité anti brute-force : max 5 tentatives par code
    if (otpRecord.attempts >= 5) {
      await this.prisma.emailOtp.delete({ where: { email: dto.email } }).catch(() => {});
      throw new BadRequestException(
        'Trop de tentatives incorrectes. Veuillez demander un nouveau code.'
      );
    }

    const isMatch = await bcrypt.compare(dto.code, otpRecord.codeHash);
    if (!isMatch) {
      const nextAttempts = otpRecord.attempts + 1;
      await this.prisma.emailOtp.update({
        where: { email: dto.email },
        data: { attempts: nextAttempts },
      });

      const remainingAttempts = 5 - nextAttempts;
      throw new UnauthorizedException(
        remainingAttempts > 0
          ? `Code incorrect. Il vous reste ${remainingAttempts} tentative(s).`
          : 'Code incorrect. Nombre maximal de tentatives atteint, veuillez demander un nouveau code.'
      );
    }

    // Code valide : supprimer l'OTP consommé
    await this.prisma.emailOtp.delete({ where: { email: dto.email } }).catch(() => {});

    // 1. Chercher si l'utilisateur existe déjà avec cet email
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    const isNewUser = !user;

    if (!user) {
      // 2. Création de l'utilisateur avec son identité 'email'
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          onboardingCompleted: false,
          identities: {
            create: {
              provider: 'email',
              providerId: dto.email,
              email: dto.email,
            },
          },
        },
      });
    } else {
      // 3. Si l'utilisateur existait (ex: créé via OAuth ou invitation), lier l'identité email si absente
      const emailIdentity = await this.prisma.userIdentity.findUnique({
        where: {
          provider_providerId: {
            provider: 'email',
            providerId: dto.email,
          },
        },
      });

      if (!emailIdentity) {
        await this.prisma.userIdentity.create({
          data: {
            userId: user.id,
            provider: 'email',
            providerId: dto.email,
            email: dto.email,
          },
        }).catch(() => {});
      }
    }

    // 4. Génération des tokens JWT
    const tokens = await this.generateTokens(user.id, user.email, user.username);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    this.logger.log(`Connexion e-mail réussie pour User ID=${user.id}, email=${user.email} (isNewUser=${isNewUser})`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        onboardingCompleted: user.onboardingCompleted,
      },
      isNewUser,
    };
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
