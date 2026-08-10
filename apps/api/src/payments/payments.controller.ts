import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { CreatePaymentDto, ListPaymentsQuery, PaymentIdParam, ReversePaymentDto } from './dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @RequirePermissions('payment.read')
  list(@AuthUser() user: AuthUserType, @Query() query: ListPaymentsQuery) {
    return this.payments.list(user.organizationId, user, query);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('payment.create')
  create(
    @AuthUser() user: AuthUserType,
    @Body() dto: CreatePaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AppRequest,
  ) {
    return this.payments.create(user, dto, metaFromRequest(req), idempotencyKey);
  }

  @Get(':id')
  @RequirePermissions('payment.read')
  get(@AuthUser() user: AuthUserType, @Param() param: PaymentIdParam) {
    return this.payments.get(user.organizationId, user, param.id);
  }

  @Post(':id/reverse')
  @RequirePermissions('payment.reverse')
  reverse(
    @AuthUser() user: AuthUserType,
    @Param() param: PaymentIdParam,
    @Body() dto: ReversePaymentDto,
    @Req() req: AppRequest,
  ) {
    return this.payments.reverse(user, param.id, dto, metaFromRequest(req));
  }

  @Get(':id/receipt')
  @RequirePermissions('payment.read')
  receipt(@AuthUser() user: AuthUserType, @Param() param: PaymentIdParam) {
    return this.payments.getReceipt(user.organizationId, user, param.id);
  }
}
