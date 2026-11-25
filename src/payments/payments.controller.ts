import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { ApiResponse } from '../common/dto/api-response.dto';
import type { BictorysWebhookPayload } from './interfaces/payment-gateway.interface';

@ApiTags('Payments (Bictorys)')
@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) { }

  @Post('payments/initiate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Initier un paiement via Bictorys (Wave, Orange Money, Free Money, Carte ou Hosted Checkout)',
  })
  async initiatePayment(
    @CurrentUser('id') userId: string,
    @Body() dto: InitiatePaymentDto,
  ) {
    const result = await this.paymentsService.initiatePayment(userId, dto);
    return ApiResponse.success(result, 'Paiement initié avec succès');
  }

  @Public()
  @SkipThrottle()
  @Post('payments/webhook/bictorys')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'X-Secret-Key',
    description: 'Clé secrète Webhook configurée dans le dashboard Bictorys',
    required: true,
  })
  @ApiOperation({
    summary: 'Endpoint Webhook Bictorys (vérifié par en-tête X-Secret-Key, exempté du rate-limiter par IP)',
  })
  async handleBictorysWebhook(
    @Headers('x-secret-key') secretHeader: string | undefined,
    @Body() payload: BictorysWebhookPayload,
  ) {
    const result = await this.paymentsService.handleBictorysWebhook(
      secretHeader,
      payload,
    );
    return ApiResponse.success(result, 'Webhook Bictorys traité');
  }

  @Public()
  @SkipThrottle()
  @Post('payments/webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiHeader({
    name: 'X-Secret-Key',
    description: 'Clé secrète Webhook configurée dans le dashboard Bictorys',
    required: true,
  })
  @ApiOperation({
    summary: 'Endpoint Webhook générique PSP / Bictorys (exempté du rate-limiter par IP)',
  })
  async handleProviderWebhook(
    @Param('provider') provider: string,
    @Headers('x-secret-key') secretHeader: string | undefined,
    @Body() payload: BictorysWebhookPayload,
  ) {
    const result = await this.paymentsService.handleBictorysWebhook(
      secretHeader,
      {
        ...payload,
        provider: payload.provider || provider,
      },
    );
    return ApiResponse.success(result, 'Webhook traité');
  }

  @Get('payments/mine')
    @ApiOperation({ summary: 'Historique paginé de mes paiements' })
    async findMyPayments(
      @CurrentUser('id') userId: string,
      @Query() query: QueryPaymentsDto,
    ) {
      const result = await this.paymentsService.findMyPayments(userId, query);
      return ApiResponse.success(
        result,
        'Historique des paiements récupéré avec succès',
      );
    }

    @Get('users/me/payments')
    @ApiOperation({
      summary: 'Historique paginé de mes paiements (alias /users/me/payments)',
    })
  async findUserPayments(
        @CurrentUser('id') userId: string,
        @Query() query: QueryPaymentsDto,
      ) {
        const result = await this.paymentsService.findMyPayments(userId, query);
        return ApiResponse.success(
          result,
          'Historique des paiements récupéré avec succès',
        );
      }

      @Post('payments/:id/verify')
      @HttpCode(HttpStatus.OK)
      @ApiOperation({
        summary:
          'Vérifie activement le statut auprès de Bictorys et synchronise le billet en cas de retard du webhook',
      })
      async verifyPayment(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) id: string,
      ) {
        const result = await this.paymentsService.verifyAndSyncPayment(userId, id);
        return ApiResponse.success(result, 'Statut du paiement synchronisé');
      }

      @Get('payments/:id')
      @ApiOperation({ summary: "Détail et statut d'un paiement" })
      async findOne(
        @CurrentUser('id') userId: string,
        @Param('id', ParseUUIDPipe) id: string,
      ) {
        const result = await this.paymentsService.findOneForUser(userId, id);
        return ApiResponse.success(result, 'Paiement récupéré avec succès');
      }
    }
