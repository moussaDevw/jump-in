import { PaymentProvider } from '@prisma/client';

export const PAYMENT_GATEWAY = 'PAYMENT_GATEWAY';

export interface InitiateGatewayChargeInput {
  paymentId: string;
  amount: number;
  currency: string;
  provider?: PaymentProvider;
  customer: {
    name: string;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    country?: string;
  };
  description?: string;
  successRedirectUrl?: string;
  errorRedirectUrl?: string;
}

export interface InitiateGatewayChargeResult {
  /** Identifiant externe Bictorys (chargeId / transactionId / id), ou null si non retourné à l'initiation */
  providerRef: string | null;
  /** URL de redirection vers le checkout Bictorys ou deep-link Wave/OM */
  checkoutUrl: string | null;
  /** Réponse brute du PSP */
  rawResponse?: Record<string, any>;
}

export interface GatewayTransactionStatusResult {
  providerRef: string;
  status: string;
  amount?: number;
  currency?: string;
  paymentType?: string;
  rawResponse?: Record<string, any>;
}

export interface BictorysWebhookPayload {
  id?: string;
  chargeId?: string;
  transactionId?: string;
  paymentReference?: string;
  merchantReference?: string;
  status?: string;
  amount?: number;
  currency?: string;
  paymentType?: string;
  provider?: string;
  data?: Record<string, any>;
  [key: string]: any;
}

export interface IPaymentGateway {
  initiateCharge(
    input: InitiateGatewayChargeInput,
  ): Promise<InitiateGatewayChargeResult>;
  getTransactionStatus(
    providerRef: string,
  ): Promise<GatewayTransactionStatusResult>;
  verifyWebhookSignature(secretHeader?: string): boolean;
}
