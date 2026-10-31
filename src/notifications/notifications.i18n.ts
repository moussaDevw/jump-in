export type SupportedLocale = 'fr' | 'en';

export type NotificationTemplateKey =
  | 'CLUB_JOIN_REQUEST'
  | 'CLUB_JOIN_APPROVED'
  | 'CLUB_JOIN_REJECTED'
  | 'CLUB_EVENT_CREATED'
  | 'SPORT_EVENT_CREATED'
  | 'EVENT_REGISTRATION'
  | 'EVENT_CANCELLATION'
  | 'SPOT_AVAILABLE';

export interface NotificationContent {
  title: string;
  body: string;
}

export interface NotificationTemplateParams {
  applicantName?: string;
  clubName?: string;
  sportName?: string;
  eventTitle?: string;
  participantName?: string;
  [key: string]: any;
}

const templates: Record<
  NotificationTemplateKey,
  Record<SupportedLocale, (params: NotificationTemplateParams) => NotificationContent>
> = {
  CLUB_JOIN_REQUEST: {
    fr: (p) => ({
      title: "Demande d'adhésion",
      body: `${p.applicantName || 'Un utilisateur'} souhaite rejoindre votre club « ${p.clubName || ''} »`,
    }),
    en: (p) => ({
      title: 'Join request',
      body: `${p.applicantName || 'A user'} wants to join your club « ${p.clubName || ''} »`,
    }),
  },
  CLUB_JOIN_APPROVED: {
    fr: (p) => ({
      title: 'Demande acceptée !',
      body: `Vous êtes maintenant membre du club « ${p.clubName || ''} »`,
    }),
    en: (p) => ({
      title: 'Request accepted!',
      body: `You are now a member of the club « ${p.clubName || ''} »`,
    }),
  },
  CLUB_JOIN_REJECTED: {
    fr: (p) => ({
      title: "Demande d'adhésion refusée",
      body: `Votre demande pour rejoindre le club « ${p.clubName || ''} » a été refusée`,
    }),
    en: (p) => ({
      title: 'Join request declined',
      body: `Your request to join the club « ${p.clubName || ''} » was declined`,
    }),
  },
  CLUB_EVENT_CREATED: {
    fr: (p) => ({
      title: 'Nouvel événement de club !',
      body: `Le club ${p.clubName || ''} organise « ${p.eventTitle || ''} »`,
    }),
    en: (p) => ({
      title: 'New club event!',
      body: `Club ${p.clubName || ''} is hosting « ${p.eventTitle || ''} »`,
    }),
  },
  SPORT_EVENT_CREATED: {
    fr: (p) => ({
      title: 'Nouvel événement pour toi !',
      body: `Nouvel événement ${p.sportName || ''} : « ${p.eventTitle || ''} »`,
    }),
    en: (p) => ({
      title: 'New event for you!',
      body: `New ${p.sportName || ''} event: « ${p.eventTitle || ''} »`,
    }),
  },
  EVENT_REGISTRATION: {
    fr: (p) => ({
      title: 'Nouvelle inscription !',
      body: `${p.participantName || 'Un participant'} a rejoint votre événement « ${p.eventTitle || ''} »`,
    }),
    en: (p) => ({
      title: 'New registration!',
      body: `${p.participantName || 'A participant'} joined your event « ${p.eventTitle || ''} »`,
    }),
  },
  EVENT_CANCELLATION: {
    fr: (p) => ({
      title: 'Désistement',
      body: `${p.participantName || 'Un participant'} a annulé sa participation à « ${p.eventTitle || ''} »`,
    }),
    en: (p) => ({
      title: 'Cancellation',
      body: `${p.participantName || 'A participant'} cancelled their participation in « ${p.eventTitle || ''} »`,
    }),
  },
  SPOT_AVAILABLE: {
    fr: (p) => ({
      title: "Une place s'est libérée !",
      body: `Une place est de nouveau disponible pour « ${p.eventTitle || ''} »`,
    }),
    en: (p) => ({
      title: 'A spot just opened up!',
      body: `A spot is available again for « ${p.eventTitle || ''} »`,
    }),
  },
};

/**
 * Normalizes locale to 'fr' or 'en'. Defaults to 'fr'.
 */
export function normalizeLocale(locale?: string | null): SupportedLocale {
  if (!locale) return 'fr';
  const lower = locale.toLowerCase().trim();
  if (lower.startsWith('en')) return 'en';
  return 'fr';
}

/**
 * Formats notification title and body according to the template key, parameters, and locale.
 */
export function formatNotification(
  key: NotificationTemplateKey,
  params: NotificationTemplateParams = {},
  locale: string = 'fr',
): NotificationContent {
  const normLocale = normalizeLocale(locale);
  const generator = templates[key]?.[normLocale] || templates[key]?.['fr'];
  if (!generator) {
    return { title: 'Notification', body: '' };
  }
  return generator(params);
}

