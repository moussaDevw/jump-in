import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderOtpEmail } from './templates/otp-email.template';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resendApiKey?: string;

  constructor(private readonly configService: ConfigService) {
    this.resendApiKey = this.configService.get<string>('RESEND_API_KEY');
  }

  /**
   * Résout une adresse d'expéditeur valide au format "Nom <email@domaine.com>" ou "email@domaine.com".
   */
  private getFromEmail(): string {
    const raw = this.configService.get<string>('RESEND_FROM_EMAIL')?.trim();
    if (!raw) {
      return 'RunHub <onboarding@resend.dev>';
    }

    // Format complet déjà valide : "RunHub <contact@domaine.com>"
    if (raw.includes('<') && raw.includes('>')) {
      return raw;
    }

    // Adresse e-mail simple : "contact@domaine.com" -> ajouter le nom RunHub
    if (raw.includes('@')) {
      return `RunHub <${raw}>`;
    }

    // Correction automatique si typo (ex: "contact.domaine.com" au lieu de "contact@domaine.com")
    if (raw.includes('.')) {
      const firstDot = raw.indexOf('.');
      const localPart = raw.substring(0, firstDot);
      const domainPart = raw.substring(firstDot + 1);
      return `RunHub <${localPart}@${domainPart}>`;
    }

    return 'RunHub <onboarding@resend.dev>';
  }

  /**
   * Envoie un code OTP à 6 chiffres par email avec rendu HTML/texte conforme au Design System.
   * En local / dev sans clé Resend, le code est affiché dans les logs du serveur.
   */
  async sendOtpCode(email: string, code: string, locale: 'fr' | 'en' = 'fr'): Promise<void> {
    this.logger.log(`\n==================================================\n🔐 [OTP RUNHUB] Email: ${email} | Code: ${code} | Langue: ${locale}\n==================================================\n`);

    if (!this.resendApiKey) {
      this.logger.warn(
        `[MailService] RESEND_API_KEY non configurée. Le code a été affiché dans la console ci-dessus pour le développement.`
      );
      return;
    }

    const fromAddress = this.getFromEmail();
    const { subject, html, text } = renderOtpEmail({ code, locale });

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [email],
          subject,
          html,
          text,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`[MailService] Erreur Resend (${response.status}): ${errorData}`);
      } else {
        this.logger.log(`[MailService] E-mail OTP envoyé avec succès à ${email} (depuis ${fromAddress})`);
      }
    } catch (err: any) {
      this.logger.error(`[MailService] Échec de l'envoi de l'e-mail: ${err.message}`, err.stack);
    }
  }
}
