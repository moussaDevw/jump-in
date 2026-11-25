import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaymentSettlementService } from './payment-settlement.service';
import { PaymentNotificationsService } from './payment-notifications.service';
import { BictorysPaymentGateway } from './providers/bictorys.gateway';
import { PAYMENT_GATEWAY } from './interfaces/payment-gateway.interface';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentSettlementService,
    PaymentNotificationsService,
    {
      provide: PAYMENT_GATEWAY,
      useClass: BictorysPaymentGateway,
    },
  ],
  exports: [PaymentsService, PaymentSettlementService],
})
export class PaymentsModule {}
