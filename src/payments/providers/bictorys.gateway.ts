import {
  Injectable,
  Logger,
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import {
  IPaymentGateway,
  InitiateGatewayChargeInput,
  InitiateGatewayChargeResult,
  GatewayTransactionStatusResult,
} from '../interfaces/payment-gateway.interface';

const INITIATE_CHARGE_TIMEOUT_MS = 12_000;
const STATUS_CHECK_TIMEOUT_MS = 8_000;

const BICTORYS_PAYMENT_TYPE_MAP: Record<PaymentProvider, string> = {
  [PaymentProvider.wave_money]: 'wave_money',
  [PaymentProvider.orange_money]: 'orange_money',
  [PaymentProvider.card]: 'card',
};

@Injectable()
export class BictorysPaymentGateway implements IPaymentGateway {
  private readonly logger = new Logger(BictorysPaymentGateway.name);
  private readonly apiUrl: string;
  private readonly apiKey?: string;
  private readonly webhookSecret?: string;
  private readonly defaultSuccessUrl: string;
  private readonly defaultErrorUrl: string;

  constructor(private readonly configService: ConfigService) {
    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';
    const defaultUrl =
      nodeEnv === 'production'
        ? 'https://api.bictorys.com'
        : 'https://api.test.bictorys.com';

    this.apiUrl = (
      this.configService.get<string>('BICTORYS_API_URL') || defaultUrl
    ).replace(/\/+$/, '');
    this.apiKey = this.configService.get<string>('BICTORYS_API_KEY');
    this.webhookSecret = this.configService.get<string>(
      'BICTORYS_WEBHOOK_SECRET',
    );
    this.defaultSuccessUrl =
      this.configService.get<string>('BICTORYS_SUCCESS_URL') ||
      'https://runhub.app/payment/success';
    this.defaultErrorUrl =
      this.configService.get<string>('BICTORYS_ERROR_URL') ||
      'https://runhub.app/payment/error';
  }

  /**
   * Initialise un paiement auprès de l'API Charges de Bictorys (`POST /pay/v1/charges`).
   */
  async initiateCharge(
    input: InitiateGatewayChargeInput,
  ): Promise<InitiateGatewayChargeResult> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'La clé API Bictorys (BICTORYS_API_KEY) n’est pas configurée sur le serveur.',
      );
    }

    const baseUrl = `${this.apiUrl}/pay/v1/charges`;
    const paymentType = input.provider
      ? BICTORYS_PAYMENT_TYPE_MAP[input.provider]
      : undefined;
    const url = paymentType
      ? `${baseUrl}?payment_type=${encodeURIComponent(paymentType)}`
      : baseUrl;

    const countryCode = input.customer.country || 'SN';

    const payload: Record<string, any> = {
      amount: input.amount,
      currency: input.currency || 'XOF',
      paymentReference: input.paymentId,
      merchantReference: input.paymentId,
      country: countryCode,
      successRedirectUrl: input.successRedirectUrl || this.defaultSuccessUrl,
      errorRedirectUrl: input.errorRedirectUrl || this.defaultErrorUrl,
      customerObject: {
        name: input.customer.name || 'Participant RunHub',
        ...(input.customer.email ? { email: input.customer.email } : {}),
        ...(input.customer.phone ? { phone: input.customer.phone } : {}),
        ...(input.customer.city ? { city: input.customer.city } : {}),
        country: countryCode,
      },
      ...(input.description
        ? {
          orderDetails: [
            {
              name: input.description,
              price: input.amount,
              quantity: 1,
              taxRate: 0,
            },
          ],
        }
        : {}),
    };

    try {
      console.log({ apiKey: this.apiKey })
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(INITIATE_CHARGE_TIMEOUT_MS),
      });

      const data = await this.parseJsonResponse(response);

      if (!response.ok) {
        this.logger.error(
          `[Bictorys] Échec d'initiation de paiement HTTP ${response.status}: ${JSON.stringify(data)}`,
        );
        throw new BadGatewayException(
          data?.message ||
          data?.error ||
          `Erreur lors de l'initialisation du paiement auprès de Bictorys (${response.status})`,
        );
      }

      const rawProviderRef =
        data.chargeId ||
        data.transactionId ||
        data.id ||
        data.data?.chargeId ||
        data.data?.transactionId ||
        data.data?.id ||
        null;

      const checkoutUrl =
        data.link ||
        data.redirectUrl ||
        data.checkoutUrl ||
        data.paymentUrl ||
        data.data?.link ||
        data.data?.redirectUrl ||
        null;

      this.logger.log(
        `[Bictorys] Charge créée avec succès pour paymentId=${input.paymentId}, providerRef=${rawProviderRef ?? 'pending_webhook'}`,
      );

      return {
        providerRef: rawProviderRef ? String(rawProviderRef) : null,
        checkoutUrl: checkoutUrl ? String(checkoutUrl) : null,
        rawResponse: data,
      };
    } catch (error: any) {
      if (
        error instanceof BadGatewayException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `[Bictorys] Erreur réseau ou timeout lors de l'appel à ${url}: ${error.message}`,
        error.stack,
      );
      throw new BadGatewayException(
        'Impossible de contacter la passerelle de paiement Bictorys (délai dépassé ou erreur réseau). Veuillez réessayer.',
      );
    }
  }

  /**
   * Interroge activement le statut d'une transaction chez Bictorys
   * (`GET /pay/v1/transactions/{transactionId}/status`).
   */
  async getTransactionStatus(
    providerRef: string,
  ): Promise<GatewayTransactionStatusResult> {
    if (!this.apiKey) {
      throw new InternalServerErrorException(
        'La clé API Bictorys (BICTORYS_API_KEY) n’est pas configurée sur le serveur.',
      );
    }

    const url = `${this.apiUrl}/pay/v1/transactions/${encodeURIComponent(providerRef)}/status`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Api-Key': this.apiKey,
        },
        signal: AbortSignal.timeout(STATUS_CHECK_TIMEOUT_MS),
      });

      const data = await this.parseJsonResponse(response);

      if (!response.ok) {
        this.logger.error(
          `[Bictorys] Échec de vérification statut HTTP ${response.status} pour ${providerRef}: ${JSON.stringify(data)}`,
        );
        throw new BadGatewayException(
          data?.message ||
          `Impossible de vérifier le statut de la transaction Bictorys (${response.status})`,
        );
      }

      const payload =
        data.data && typeof data.data === 'object' ? data.data : data;

      return {
        providerRef: String(
          payload.transactionId || payload.chargeId || payload.id || providerRef,
        ),
        status: String(payload.status || ''),
        amount:
          payload.amount !== undefined ? Number(payload.amount) : undefined,
        currency: payload.currency ? String(payload.currency) : undefined,
        paymentType: payload.paymentType || payload.provider,
        rawResponse: data,
      };
    } catch (error: any) {
      if (
        error instanceof BadGatewayException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(
        `[Bictorys] Erreur réseau ou timeout lors de la vérification ${url}: ${error.message}`,
        error.stack,
      );
      throw new BadGatewayException(
        'Impossible de vérifier le statut auprès de Bictorys pour le moment.',
      );
    }
  }

  /**
   * Vérifie l'en-tête `X-Secret-Key` envoyé par Bictorys lors d'un appel Webhook.
   */
  verifyWebhookSignature(secretHeader?: string): boolean {
    if (!this.webhookSecret) {
      this.logger.warn(
        '[Bictorys] BICTORYS_WEBHOOK_SECRET non configuré : refus du webhook par sécurité.',
      );
      return false;
    }

    if (!secretHeader) {
      return false;
    }

    const expectedBuffer = Buffer.from(this.webhookSecret.trim(), 'utf8');
    const receivedBuffer = Buffer.from(secretHeader.trim(), 'utf8');

    if (expectedBuffer.length !== receivedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, receivedBuffer);
  }

  private async parseJsonResponse(
    response: Response,
  ): Promise<Record<string, any>> {
    const rawText = await response.text();
    if (!rawText) return {};
    try {
      return JSON.parse(rawText);
    } catch {
      return { raw: rawText };
    }
  }
}
