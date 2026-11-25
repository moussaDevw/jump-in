import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PaymentProvider } from '@prisma/client';
import { BictorysPaymentGateway } from './bictorys.gateway';

describe('BictorysPaymentGateway', () => {
  let gateway: BictorysPaymentGateway;
  const originalFetch = global.fetch;

  const createGateway = async (configOverrides: Record<string, any> = {}) => {
    const defaultConfig: Record<string, any> = {
      NODE_ENV: 'development',
      BICTORYS_API_URL: 'https://api.test.bictorys.com',
      BICTORYS_API_KEY: 'test_public-key-123',
      BICTORYS_WEBHOOK_SECRET: 'my-secret-webhook-key',
      BICTORYS_SUCCESS_URL: 'https://runhub.app/payment/success',
      BICTORYS_ERROR_URL: 'https://runhub.app/payment/error',
      ...configOverrides,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BictorysPaymentGateway,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => defaultConfig[key]),
          },
        },
      ],
    }).compile();

    return module.get<BictorysPaymentGateway>(BictorysPaymentGateway);
  };

  beforeEach(async () => {
    gateway = await createGateway();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('initiateCharge', () => {
    it('should throw InternalServerErrorException when BICTORYS_API_KEY is missing', async () => {
      const unconfiguredGateway = await createGateway({
        BICTORYS_API_KEY: undefined,
      });

      await expect(
        unconfiguredGateway.initiateCharge({
          paymentId: 'pay-1',
          amount: 5000,
          currency: 'XOF',
          customer: { name: 'Musa Diagne', email: 'musa@example.com' },
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });

      it('should return providerRef: null if Bictorys 202 response only returns a checkout link without ID', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 202,
          text: async () =>
            JSON.stringify({
              link: 'https://checkout.test.bictorys.com/pay/session-xyz',
            }),
        }) as any;

        const result = await gateway.initiateCharge({
          paymentId: 'pay-uuid-no-ref',
          amount: 3000,
          currency: 'XOF',
          customer: { name: 'Musa Diagne' },
        });

        expect(result.providerRef).toBeNull();
        expect(result.checkoutUrl).toBe(
          'https://checkout.test.bictorys.com/pay/session-xyz',
        );
      });

      it('should call Bictorys hosted checkout with AbortSignal timeout and return chargeId', async () => {
        const mockFetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 202,
          text: async () =>
            JSON.stringify({
              chargeId: 'chg_bictorys_001',
              link: 'https://checkout.test.bictorys.com/pay/chg_bictorys_001',
            }),
        });
        global.fetch = mockFetch as any;

        const result = await gateway.initiateCharge({
          paymentId: 'pay-uuid-123',
          amount: 3000,
          currency: 'XOF',
          customer: {
            name: 'Musa Diagne',
            email: 'musa@runhub.sn',
            phone: '+221770000000',
          },
          description: 'Billet RunHub — Dakar Night Run',
        });

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [calledUrl, options] = mockFetch.mock.calls[0];
        expect(calledUrl).toBe('https://api.test.bictorys.com/pay/v1/charges');
        expect(options.headers['X-Api-Key']).toBe('test_public-key-123');
        expect(options.signal).toBeDefined();

        expect(result).toEqual({
          providerRef: 'chg_bictorys_001',
          checkoutUrl: 'https://checkout.test.bictorys.com/pay/chg_bictorys_001',
          rawResponse: {
            chargeId: 'chg_bictorys_001',
            link: 'https://checkout.test.bictorys.com/pay/chg_bictorys_001',
          },
        });
      });

      it('should append ?payment_type=wave_money when WAVE provider is requested directly', async () => {
        const mockFetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 201,
          text: async () =>
            JSON.stringify({
              transactionId: 'tx_wave_999',
              redirectUrl: 'https://pay.wave.com/c/tx_wave_999',
            }),
        });
        global.fetch = mockFetch as any;

        const result = await gateway.initiateCharge({
          paymentId: 'pay-uuid-456',
          amount: 5000,
          currency: 'XOF',
          provider: PaymentProvider.wave_money,
          customer: { name: 'Awa Ndiaye', phone: '+221771234567' },
        });

        const [calledUrl] = mockFetch.mock.calls[0];
        expect(calledUrl).toBe(
          'https://api.test.bictorys.com/pay/v1/charges?payment_type=wave_money',
        );
        expect(result.providerRef).toBe('tx_wave_999');
        expect(result.checkoutUrl).toBe('https://pay.wave.com/c/tx_wave_999');
      });

      it('should throw BadGatewayException when Bictorys returns an HTTP error', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          ok: false,
          status: 400,
          text: async () => JSON.stringify({ message: 'Invalid currency' }),
        }) as any;

        await expect(
          gateway.initiateCharge({
            paymentId: 'pay-err',
            amount: 5000,
            currency: 'INVALID',
            customer: { name: 'Test' },
          }),
        ).rejects.toThrow(BadGatewayException);
      });
    });

    describe('getTransactionStatus', () => {
      it('should query GET /pay/v1/transactions/:id/status and return normalized status', async () => {
        const mockFetch = jest.fn().mockResolvedValue({
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              transactionId: 'tx_123',
              status: 'succeeded',
              amount: 5000,
              currency: 'XOF',
              paymentType: 'wave_money',
            }),
        });
        global.fetch = mockFetch as any;

        const status = await gateway.getTransactionStatus('tx_123');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.test.bictorys.com/pay/v1/transactions/tx_123/status',
          expect.objectContaining({
            method: 'GET',
          }),
        );
        expect(status).toEqual(
          expect.objectContaining({
            providerRef: 'tx_123',
            status: 'succeeded',
            amount: 5000,
            currency: 'XOF',
            paymentType: 'wave_money',
          }),
        );
      });
    });

    describe('verifyWebhookSignature', () => {
      it('should return true for a matching X-Secret-Key header', () => {
        expect(gateway.verifyWebhookSignature('my-secret-webhook-key')).toBe(
          true,
        );
      });

      it('should return false for an invalid or missing X-Secret-Key header', () => {
        expect(gateway.verifyWebhookSignature('wrong-key')).toBe(false);
        expect(gateway.verifyWebhookSignature(undefined)).toBe(false);
        expect(gateway.verifyWebhookSignature('')).toBe(false);
      });
    });
  });
