import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.fromEmail =
      this.configService.get<string>('RESEND_FROM_EMAIL') ||
      'RunHub <onboarding@resend.dev>';
  }

  /**
   * Envoie un code OTP à 6 chiffres par email.
   * En local / dev sans clé Resend, le code est affiché dans les logs du serveur.
   */
  async sendOtpCode(email: string, code: string): Promise<void> {
    this.logger.log(`\n==================================================\n🔐 [OTP RUNHUB] Email: ${email} | Code: ${code}\n==================================================\n`);

    if (!this.apiKey) {
      this.logger.warn(
        `[MailService] RESEND_API_KEY non configurée. Le code a été affiché dans la console ci-dessus pour le développement.`
      );
      return;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromEmail,
          to: [email],
          subject: `RunHub - Votre code de connexion : ${code}`,
          html: this.getOtpEmailTemplate(code),
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`[MailService] Erreur Resend (${response.status}): ${errorData}`);
      } else {
        this.logger.log(`[MailService] E-mail OTP envoyé avec succès à ${email}`);
      }
    } catch (err: any) {
      this.logger.error(`[MailService] Échec de l'envoi de l'e-mail: ${err.message}`, err.stack);
    }
  }

  private getOtpEmailTemplate(code: string): string {
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Code de connexion RunHub</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f5f4; margin: 0; padding: 40px 16px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.06); border: 1px solid #eaeaea;">
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background-color: #b8324f;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 1px;">RunHub</h1>
              <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px;">Communauté Sportive</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center;">
              <h2 style="color: #232220; margin: 0 0 12px; font-size: 20px; font-weight: 700;">Votre code de vérification</h2>
              <p style="color: #65625e; font-size: 14px; line-height: 22px; margin: 0 0 28px;">
                Utilisez le code temporaire ci-dessous pour vous connecter ou créer votre compte sur l'application RunHub.
              </p>
              
              <div style="background-color: #fdf0f3; border: 1.5px dashed #b8324f; border-radius: 14px; padding: 18px 24px; display: inline-block; margin-bottom: 28px;">
                <span style="font-family: 'Courier New', Courier, monospace; font-size: 34px; font-weight: 800; color: #b8324f; letter-spacing: 8px;">${code}</span>
              </div>

              <p style="color: #a2a09b; font-size: 12px; line-height: 18px; margin: 0;">
                Ce code expire dans <strong>10 minutes</strong>.<br />
                Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #fafaf9; text-align: center; border-top: 1px solid #f0f0ed;">
              <p style="color: #a2a09b; font-size: 11px; margin: 0;">
                © 2026 RunHub. Tous droits réservés.
              </p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }
}

