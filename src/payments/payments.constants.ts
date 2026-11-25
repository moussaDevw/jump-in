import { Prisma, PaymentProvider, RegistrationStatus } from '@prisma/client';

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Durée maximale de réservation d'une place non payée (20 minutes) */
export const PENDING_REGISTRATION_TTL_MS = 20 * 60 * 1000;

export function isUuid(value?: string | null): value is string {
  return Boolean(value && UUID_REGEX.test(value));
}

/**
 * Projection Prisma réutilisée pour l'affichage des paiements côté utilisateur.
 */
export const USER_PAYMENT_INCLUDE = {
  registration: {
    select: {
      id: true,
      ticketCode: true,
      status: true,
      event: {
        select: {
          id: true,
          title: true,
          coverUrl: true,
          startsAt: true,
          venueName: true,
          price: true,
          currency: true,
        },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

/**
 * Masque le `ticketCode` tant que l'inscription n'est pas réglée (`PAID` ou `CHECKED_IN`).
 */
export function sanitizePaymentTicketVisibility<
  T extends {
    registration?: { status: RegistrationStatus; ticketCode: string | null } | null;
  },
>(payment: T): T {
  if (!payment?.registration) return payment;
  const isPaid =
    payment.registration.status === RegistrationStatus.PAID ||
    payment.registration.status === RegistrationStatus.CHECKED_IN;
  if (isPaid) return payment;

  return {
    ...payment,
    registration: {
      ...payment.registration,
      ticketCode: null,
    },
  };
}

/**
 * Projection Prisma utilisée lors du règlement d'un paiement (Webhook ou Sync).
 */
export const SETTLEMENT_PAYMENT_INCLUDE = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
    },
  },
  registration: {
    include: {
      event: {
        select: {
          id: true,
          title: true,
          organizerId: true,
          capacity: true,
          status: true,
        },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

export type SettlementPaymentRecord = Prisma.PaymentGetPayload<{
  include: typeof SETTLEMENT_PAYMENT_INCLUDE;
}>;

const SUCCESS_STATUSES = new Set([
  'succeeded',
  'success',
  'succès',
  'paid',
  'completed',
  'authorized',
]);

const FAILED_STATUSES = new Set([
  'failed',
  'échoué',
  'cancelled',
  'canceled',
  'expired',
  'declined',
  'error',
]);

export type ClassifiedGatewayStatus = 'success' | 'failed' | 'pending';

export function classifyGatewayStatus(
  rawStatus?: string | null,
): ClassifiedGatewayStatus {
  const normalized = (rawStatus || '').toLowerCase().trim();
  if (SUCCESS_STATUSES.has(normalized)) return 'success';
  if (FAILED_STATUSES.has(normalized)) return 'failed';
  return 'pending';
}

export function resolveProviderFromGateway(
  rawPaymentType: string | undefined,
  fallback: PaymentProvider,
): PaymentProvider {
  if (!rawPaymentType) return fallback;
  const normalized = rawPaymentType.toLowerCase();
  if (normalized.includes('wave')) return PaymentProvider.wave_money;
  if (normalized.includes('orange')) return PaymentProvider.orange_money;
  if (
    normalized.includes('card') ||
    normalized.includes('visa') ||
    normalized.includes('mastercard')
  ) {
    return PaymentProvider.card;
  }
  return fallback;
}

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  senegal: 'SN',
  sénégal: 'SN',
  sn: 'SN',
  "cote d'ivoire": 'CI',
  "côte d'ivoire": 'CI',
  ci: 'CI',
  mali: 'ML',
  ml: 'ML',
  'burkina faso': 'BF',
  bf: 'BF',
  benin: 'BJ',
  bénin: 'BJ',
  bj: 'BJ',
  togo: 'TG',
  tg: 'TG',
  guinee: 'GN',
  guinée: 'GN',
  gn: 'GN',
  france: 'FR',
  fr: 'FR',
};

export function resolveIsoCountryCode(country?: string | null): string {
  if (!country) return 'SN';
  const cleaned = country.trim();
  if (/^[A-Za-z]{2}$/.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  return COUNTRY_NAME_TO_ISO2[cleaned.toLowerCase()] || 'SN';
}

/**
 * Vérifie qu'une URL de redirection client est sûre contre les attaques Open Redirect.
 * Autorise les deep-links mobiles (`runhub://`, `exp://` hors prod) ainsi que les origines HTTP(S) de confiance.
 */
export function isAllowedRedirectUrl(
  candidateUrl: string,
  allowedHttpOrigins: string[],
  isProduction: boolean,
): boolean {
  const trimmed = candidateUrl.trim();
  if (!trimmed) return false;

  if (/^runhub:\/\//i.test(trimmed)) {
    return true;
  }

  if (!isProduction && /^exp:\/\//i.test(trimmed)) {
    return true;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && (isProduction || parsed.protocol !== 'http:')) {
      return false;
    }
    const candidateOrigin = parsed.origin.toLowerCase();
    return allowedHttpOrigins.some(
      (origin) => origin.toLowerCase() === candidateOrigin,
    );
  } catch {
    return false;
  }
}
