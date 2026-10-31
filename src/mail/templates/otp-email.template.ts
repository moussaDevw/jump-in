/**
 * Design System RunHub — Tokens pour e-mails transactionnels
 */
export const EmailTheme = {
  colors: {
    // Thème de fond
    background: '#f5f5f4', // Brume
    cardBackground: '#ffffff',
    cardBorder: '#eae7e3',
    // Typographie
    textPrimary: '#232220', // Ink
    textSecondary: '#65625e', // Ink-2
    textMuted: '#a2a09b', // Ink-3
    // Marque
    bissap: '#b8324f', // Rouge hibiscus — accent de marque RunHub
    bissapLight: '#fdf0f3', // Fond bissap léger
    bissapBorder: '#f2ccd5',
  },
  fonts: {
    heading: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    body: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    mono: "'Geist Mono', 'SF Mono', Consolas, Menlo, Monaco, 'Courier New', monospace",
  },
  radius: {
    card: '24px',
    box: '16px',
    pill: '999px',
  },
} as const;

export interface OtpEmailOptions {
  code: string;
  locale?: 'fr' | 'en';
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderOtpEmail({ code, locale = 'fr' }: OtpEmailOptions): RenderedEmail {
  const isFr = locale !== 'en';

  const strings = isFr
    ? {
        subject: `RunHub — Votre code de connexion : ${code}`,
        tagline: 'COMMUNAUTÉ SPORTIVE',
        title: 'Connexion à RunHub',
        greeting: 'Bonjour,',
        description:
          'Utilisez le code de vérification ci-dessous pour vous connecter ou finaliser la création de votre compte.',
        validity: 'Ce code est valable pendant <strong>10 minutes</strong>.',
        securityNotice:
          'Ne partagez jamais ce code avec quiconque. Si vous n’avez pas demandé ce code, vous pouvez ignorer cet e-mail en toute sécurité.',
        slogan: 'Rejoignez des clubs, participez à des sorties et suivez vos performances.',
        footerNotice: '© 2026 RunHub. Tous droits réservés.',
      }
    : {
        subject: `RunHub — Your verification code: ${code}`,
        tagline: 'SPORTS COMMUNITY',
        title: 'Sign in to RunHub',
        greeting: 'Hello,',
        description:
          'Use the verification code below to sign in or complete your account registration.',
        validity: 'This code is valid for <strong>10 minutes</strong>.',
        securityNotice:
          'Never share this code with anyone. If you did not request this code, you can safely ignore this email.',
        slogan: 'Join clubs, attend running sessions and track your performance.',
        footerNotice: '© 2026 RunHub. All rights reserved.',
      };

  const formattedDigits = code.split('').join('&nbsp;&nbsp;');

  const html = `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${strings.subject}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: ${EmailTheme.colors.background};
      font-family: ${EmailTheme.fonts.body};
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    table {
      border-collapse: separate;
    }
    @media only screen and (max-width: 600px) {
      .email-wrapper {
        padding: 20px 12px !important;
      }
      .card-content {
        padding: 28px 20px !important;
      }
      .otp-code {
        font-size: 32px !important;
        letter-spacing: 6px !important;
      }
    }
  </style>
</head>
<body style="background-color: ${EmailTheme.colors.background}; margin: 0; padding: 0;">
  <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="email-wrapper" style="background-color: ${EmailTheme.colors.background}; padding: 48px 16px;">
    <tr>
      <td align="center">
        <!-- Carte Principale -->
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 520px; background-color: ${EmailTheme.colors.cardBackground}; border-radius: ${EmailTheme.radius.card}; border: 1px solid ${EmailTheme.colors.cardBorder}; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);">
          
          <!-- En-tête avec identité visuelle Bissap -->
          <tr>
            <td style="background-color: ${EmailTheme.colors.bissap}; padding: 32px 32px 28px; text-align: center;">
              <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <span style="display: inline-block; font-family: ${EmailTheme.fonts.heading}; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; text-decoration: none;">
                      RunHub
                    </span>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 6px;">
                    <span style="display: inline-block; font-family: ${EmailTheme.fonts.mono}; font-size: 11px; font-weight: 600; color: rgba(255, 255, 255, 0.85); letter-spacing: 1.5px; text-transform: uppercase;">
                      ${strings.tagline}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corps du message -->
          <tr>
            <td class="card-content" style="padding: 36px 36px 28px; text-align: center;">
              <h1 style="margin: 0 0 12px; font-family: ${EmailTheme.fonts.heading}; font-size: 22px; font-weight: 700; color: ${EmailTheme.colors.textPrimary}; letter-spacing: -0.3px;">
                ${strings.title}
              </h1>

              <p style="margin: 0 0 28px; font-size: 14px; line-height: 22px; color: ${EmailTheme.colors.textSecondary};">
                ${strings.description}
              </p>

              <!-- Boîte Code OTP stylisée Design System -->
              <table role="presentation" align="center" border="0" cellpadding="0" cellspacing="0" style="margin: 0 auto 28px;">
                <tr>
                  <td style="background-color: ${EmailTheme.colors.bissapLight}; border: 1.5px solid ${EmailTheme.colors.bissapBorder}; border-radius: ${EmailTheme.radius.box}; padding: 18px 28px; text-align: center;">
                    <div class="otp-code" style="font-family: ${EmailTheme.fonts.mono}; font-size: 34px; font-weight: 800; color: ${EmailTheme.colors.bissap}; letter-spacing: 8px; line-height: 1;">
                      ${formattedDigits}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Mention de validité -->
              <p style="margin: 0 0 24px; font-size: 13px; line-height: 20px; color: ${EmailTheme.colors.textSecondary};">
                ${strings.validity}
              </p>

              <!-- Ligne de séparation douce -->
              <div style="height: 1px; background-color: ${EmailTheme.colors.cardBorder}; margin: 24px 0;"></div>

              <!-- Note de sécurité -->
              <p style="margin: 0; font-size: 12px; line-height: 18px; color: ${EmailTheme.colors.textMuted};">
                ${strings.securityNotice}
              </p>
            </td>
          </tr>

          <!-- Pied de carte -->
          <tr>
            <td style="background-color: #fafaf9; padding: 20px 32px; text-align: center; border-top: 1px solid #f0f0ed;">
              <p style="margin: 0 0 6px; font-size: 12px; color: ${EmailTheme.colors.textSecondary};">
                ${strings.slogan}
              </p>
              <p style="margin: 0; font-family: ${EmailTheme.fonts.mono}; font-size: 11px; color: ${EmailTheme.colors.textMuted};">
                ${strings.footerNotice}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const text = `
RunHub — ${strings.tagline}

${strings.title}

${strings.description}

VOTRE CODE : ${code}

${strings.validity.replace(/<\/?[^>]+(>|$)/g, '')}

${strings.securityNotice}

${strings.footerNotice}
  `.trim();

  return { subject: strings.subject, html, text };
}

