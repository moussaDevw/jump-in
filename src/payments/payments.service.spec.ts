import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  EventStatus,
  PaymentProvider,
  PaymentStatus,
  RegistrationStatus,
} from '@prisma/client';
import { PaymentsService } from './payments.service';
import { PaymentSettlementService } from './payment-settlement.service';
import { PaymentNotificationsService } from './payment-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PAYMENT_GATEWAY } from './interfaces/payment-gateway.interface';

jest.mock('expo-server-sdk', () => ({
  Expo: class MockExpo {
    static isExpoPushToken() {
      return true;
    }
    chunkPushNotifications(msgs: any[]) {
      return [msgs];
    }
    sendPushNotificationsAsync() {
      return Promise.resolve([]);
    }
  },
}));

  describe('PaymentsService & PaymentSettlementService', () => {
    let service: PaymentsService;

    const futureDate = new Date(Date.now() + 7 * 24 * 3600 * 1000);

    const mockPrisma = {
      registration: {
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      paymentMethod: {
        findFirst: jest.fn(),
      },
      payment: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };

    const mockGateway = {
      initiateCharge: jest.fn(),
      getTransactionStatus: jest.fn(),
      verifyWebhookSignature: jest.fn(),
    };

    const mockNotifications = {
      sendLocalizedToUser: jest.fn().mockResolvedValue(null),
    };

      beforeEach(async () => {
        jest.clearAllMocks();

        mockPrisma.$queryRaw.mockResolvedValue([{ id: 'reg-1' }]);
        mockPrisma.payment.count.mockResolvedValue(0);
        mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
        mockPrisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

        mockPrisma.$transaction.mockImplementation(async (cb: any) => {
          if (typeof cb === 'function') {
            return cb(mockPrisma);
          }
          return Promise.all(cb);
        });

              const module: TestingModule = await Test.createTestingModule({
                providers: [
                  PaymentsService,
                  PaymentSettlementService,
                  PaymentNotificationsService,
                  { provide: PrismaService, useValue: mockPrisma },
                  {
                    provide: ConfigService,
                    useValue: {
                      get: jest.fn((key: string) => {
                        const map: Record<string, string> = {
                          PLATFORM_FEE_PERCENT: '3',
                          NODE_ENV: 'production',
                          BICTORYS_SUCCESS_URL: 'https://runhub.app/payment/success',
                          BICTORYS_ERROR_URL: 'https://runhub.app/payment/error',
                        };
                        return map[key];
                      }),
                    },
            },
            { provide: NotificationsService, useValue: mockNotifications },
            { provide: PAYMENT_GATEWAY, useValue: mockGateway },
          ],
        }).compile();

        service = module.get<PaymentsService>(PaymentsService);
      });

      describe('initiatePayment', () => {
        const baseRegistration = {
          id: 'reg-1',
          userId: 'user-1',
          eventId: 'evt-1',
          ticketCode: 'ABCD2345',
          status: RegistrationStatus.PENDING,
          event: {
            id: 'evt-1',
            title: 'Semi-Marathon de Dakar',
            status: EventStatus.PUBLISHED,
            price: 5000,
            currency: 'XOF',
            city: 'Dakar',
            country: 'Sénégal',
            startsAt: futureDate,
            endsAt: null,
          },
          user: {
            id: 'user-1',
            firstName: 'Musa',
            lastName: 'Diagne',
            username: 'musa',
            email: 'musa@runhub.sn',
            city: 'Dakar',
          },
        };

        it('should block untrusted Open Redirect URLs in successRedirectUrl / errorRedirectUrl', async () => {
          await expect(
            service.initiatePayment('user-1', {
              registrationId: 'reg-1',
              successRedirectUrl: 'https://evil-phishing.com/steal',
            }),
          ).rejects.toThrow(BadRequestException);
        });

            it('should allow runhub:// deep link, mask ticketCode while PENDING, and return checkoutUrl', async () => {
            mockPrisma.registration.findUnique.mockResolvedValue(baseRegistration);
            mockPrisma.payment.create.mockResolvedValue({
              id: '550e8400-e29b-41d4-a716-446655440000',
              registrationId: 'reg-1',
              userId: 'user-1',
                provider: PaymentProvider.wave_money,
                amount: 5000,
                fee: 150,
                currency: 'XOF',
                status: PaymentStatus.PENDING,
              });
            mockGateway.initiateCharge.mockResolvedValue({
              providerRef: 'chg_bictorys_123',
              checkoutUrl: 'https://checkout.test.bictorys.com/pay/chg_bictorys_123',
            });
            mockPrisma.payment.update.mockResolvedValue({
              id: '550e8400-e29b-41d4-a716-446655440000',
              providerRef: 'chg_bictorys_123',
              amount: 5000,
              fee: 150,
              status: PaymentStatus.PENDING,
              registration: {
                id: 'reg-1',
                ticketCode: 'ABCD2345',
                status: RegistrationStatus.PENDING,
              },
          });

          const result = await service.initiatePayment('user-1', {
            registrationId: 'reg-1',
            provider: PaymentProvider.wave_money,
            phone: '+221770000000',
            successRedirectUrl: 'runhub://payment/success',
          });

          expect(result.payment.registration?.ticketCode).toBeNull();
          expect(result.checkoutUrl).toBe(
            'https://checkout.test.bictorys.com/pay/chg_bictorys_123',
          );
        });

        it('should reject initiation if event is CANCELLED or already ended', async () => {
          mockPrisma.registration.findUnique.mockResolvedValue({
            ...baseRegistration,
            event: { ...baseRegistration.event, status: EventStatus.CANCELLED },
          });

          await expect(
            service.initiatePayment('user-1', { registrationId: 'reg-1' }),
          ).rejects.toThrow(BadRequestException);
        });

        it('should throw ConflictException if registration is already PAID', async () => {
          mockPrisma.registration.findUnique.mockResolvedValue({
            ...baseRegistration,
            status: RegistrationStatus.PAID,
          });

          await expect(
            service.initiatePayment('user-1', { registrationId: 'reg-1' }),
          ).rejects.toThrow(ConflictException);
        });

        it('should throw ForbiddenException if user does not own the registration', async () => {
          mockPrisma.registration.findUnique.mockResolvedValue(baseRegistration);

          await expect(
            service.initiatePayment('other-user', { registrationId: 'reg-1' }),
          ).rejects.toThrow(ForbiddenException);
        });
      });

          describe('handleBictorysWebhook & edge cases', () => {
          const samplePayment = {
            id: '550e8400-e29b-41d4-a716-446655440000',
            registrationId: 'reg-1',
            userId: 'user-1',
            provider: PaymentProvider.wave_money,
            amount: 5000,
            fee: 150,
            currency: 'XOF',
            status: PaymentStatus.PENDING,
            providerRef: 'chg_bictorys_123',
            user: {
              id: 'user-1',
              firstName: 'Musa',
              lastName: 'Diagne',
              username: 'musa',
            },
            registration: {
              id: 'reg-1',
              eventId: 'evt-1',
              status: RegistrationStatus.PENDING,
              event: {
                id: 'evt-1',
                title: 'Semi-Marathon de Dakar',
                organizerId: 'org-1',
                capacity: 20,
                status: EventStatus.PUBLISHED,
              },
            },
          };

          it('should reject webhook with UnauthorizedException when signature is invalid', async () => {
            mockGateway.verifyWebhookSignature.mockReturnValue(false);

            await expect(
              service.handleBictorysWebhook('bad-secret', {
                id: 'chg_bictorys_123',
                status: 'succeeded',
              }),
            ).rejects.toThrow(UnauthorizedException);
          });

          it('should reject webhook with BadRequestException on amount or currency mismatch', async () => {
            mockGateway.verifyWebhookSignature.mockReturnValue(true);
            mockPrisma.payment.findUnique.mockResolvedValue(samplePayment);

            await expect(
              service.handleBictorysWebhook('valid-secret', {
                paymentReference: samplePayment.id,
                status: 'succeeded',
                amount: 1000,
                currency: 'XOF',
              }),
            ).rejects.toThrow(BadRequestException);
          });

          it('should atomically settle SUCCESS, cancel sibling PENDING attempts, log AuditLog, and notify both user & organizer', async () => {
            mockGateway.verifyWebhookSignature.mockReturnValue(true);
            mockPrisma.payment.findUnique.mockResolvedValue(samplePayment);
            mockPrisma.payment.count.mockResolvedValue(0);
            mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
            mockPrisma.registration.findUnique.mockResolvedValue({
              id: 'reg-1',
              eventId: 'evt-1',
              status: RegistrationStatus.PENDING,
            });

            const res = await service.handleBictorysWebhook('valid-secret', {
              id: 'chg_bictorys_123',
              paymentReference: samplePayment.id,
              status: 'succeeded',
              amount: 5000,
              currency: 'XOF',
              paymentType: 'wave_money',
            });

            expect(res.status).toBe(PaymentStatus.SUCCESS);
            expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
              expect.objectContaining({
                data: expect.objectContaining({
                  entityType: 'Payment',
                  entityId: samplePayment.id,
                  action: 'payment_succeeded',
                }),
              }),
            );
            // Both buyer (PAYMENT_SUCCESS) and organizer (EVENT_REGISTRATION) notified
            expect(mockNotifications.sendLocalizedToUser).toHaveBeenCalledTimes(2);
          });

          it('should NOT send PAYMENT_FAILED notification if registration is already PAID via an earlier attempt', async () => {
            mockGateway.verifyWebhookSignature.mockReturnValue(true);
            mockPrisma.payment.findUnique.mockResolvedValue(samplePayment);
            mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
            mockPrisma.registration.findUnique.mockResolvedValue({
              status: RegistrationStatus.PAID, // Already paid!
            });

            const res = await service.handleBictorysWebhook('valid-secret', {
              paymentReference: samplePayment.id,
              status: 'expired',
            });

            expect(res.status).toBe(PaymentStatus.FAILED);
            expect(mockNotifications.sendLocalizedToUser).not.toHaveBeenCalled();
          });

          it('should prevent overbooking if registration was CANCELLED and event reached full capacity', async () => {
            mockGateway.verifyWebhookSignature.mockReturnValue(true);
            mockPrisma.payment.findUnique.mockResolvedValue(samplePayment);
            mockPrisma.payment.count.mockResolvedValue(0);
            mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
            mockPrisma.registration.findUnique.mockResolvedValue({
              id: 'reg-1',
              eventId: 'evt-1',
              status: RegistrationStatus.CANCELLED,
            });
            mockPrisma.$queryRaw.mockResolvedValue([
              { id: 'evt-1', status: 'published', capacity: 20 },
            ]);
            mockPrisma.registration.count.mockResolvedValue(20);

            const res = await service.handleBictorysWebhook('valid-secret', {
              paymentReference: samplePayment.id,
              status: 'succeeded',
              amount: 5000,
              currency: 'XOF',
            });

            expect(res.status).toBe(PaymentStatus.SUCCESS);
            expect(res.refundRequired).toBe('event_full');
            expect(mockPrisma.registration.update).not.toHaveBeenCalled();
            expect(mockNotifications.sendLocalizedToUser).not.toHaveBeenCalled();
          });
        });

      describe('verifyAndSyncPayment', () => {
        it('should poll Bictorys transaction status and settle PENDING payment immediately', async () => {
          const pendingPayment = {
            id: '550e8400-e29b-41d4-a716-446655440000',
            registrationId: 'reg-1',
            userId: 'user-1',
            provider: PaymentProvider.orange_money,
            amount: 5000,
            fee: 150,
            currency: 'XOF',
            status: PaymentStatus.PENDING,
            providerRef: 'tx_om_777',
            user: {
              id: 'user-1',
              firstName: 'Musa',
              lastName: 'Diagne',
              username: 'musa',
            },
            registration: {
              id: 'reg-1',
              eventId: 'evt-1',
              status: RegistrationStatus.PENDING,
              event: {
                id: 'evt-1',
                title: 'Semi-Marathon de Dakar',
                organizerId: 'org-1',
                capacity: null,
                status: EventStatus.PUBLISHED,
              },
            },
          };

              mockPrisma.payment.findUnique
                .mockResolvedValueOnce(pendingPayment)
                .mockResolvedValueOnce({
                  ...pendingPayment,
                  status: PaymentStatus.SUCCESS,
                  registration: {
                    id: 'reg-1',
            ticketCode: 'ABCD2345',
              status: RegistrationStatus.PAID,
          },
        });

          mockGateway.getTransactionStatus.mockResolvedValue({
            providerRef: 'tx_om_777',
            status: 'succeeded',
            amount: 5000,
            currency: 'XOF',
            paymentType: 'orange_money',
          });

          mockPrisma.payment.count.mockResolvedValue(0);
          mockPrisma.payment.updateMany.mockResolvedValue({ count: 1 });
          mockPrisma.registration.findUnique.mockResolvedValue({
            id: 'reg-1',
            eventId: 'evt-1',
            status: RegistrationStatus.PENDING,
          });

        const synced = await service.verifyAndSyncPayment(
          'user-1',
          pendingPayment.id,
        );

    expect(mockGateway.getTransactionStatus).toHaveBeenCalledWith(
      'tx_om_777',
    );
    expect(mockPrisma.registration.update).toHaveBeenCalledWith({
      where: { id: 'reg-1' },
      data: { status: RegistrationStatus.PAID },
    });
    expect(synced.status).toBe(PaymentStatus.SUCCESS);
    expect(synced.registration?.ticketCode).toBe('ABCD2345');
  });
});
});
