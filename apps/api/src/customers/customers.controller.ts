import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { CustomersService } from './customers.service';
import { ArchiveReasonDto, CreateCustomerDto, CustomerIdParam, ListCustomersQuery, UpdateCustomerDto } from './dto';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermissions('customer.read')
  list(@AuthUser() user: AuthUserType, @Query() query: ListCustomersQuery) {
    return this.customers.list(user.organizationId, user, query);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('customer.create')
  create(@AuthUser() user: AuthUserType, @Body() dto: CreateCustomerDto, @Req() req: AppRequest) {
    return this.customers.create(user, dto, metaFromRequest(req));
  }

  @Get(':id')
  @RequirePermissions('customer.read')
  get(@AuthUser() user: AuthUserType, @Param() param: CustomerIdParam) {
    return this.customers.get(user.organizationId, user, param.id);
  }

  @Patch(':id')
  @RequirePermissions('customer.update')
  update(
    @AuthUser() user: AuthUserType,
    @Param() param: CustomerIdParam,
    @Body() dto: UpdateCustomerDto,
    @Req() req: AppRequest,
  ) {
    return this.customers.update(user, param.id, dto, metaFromRequest(req));
  }

  @Post(':id/archive')
  @RequirePermissions('customer.archive')
  archive(
    @AuthUser() user: AuthUserType,
    @Param() param: CustomerIdParam,
    @Body() dto: ArchiveReasonDto,
    @Req() req: AppRequest,
  ) {
    return this.customers.archive(user, param.id, dto, metaFromRequest(req));
  }

  @Post(':id/reactivate')
  @RequirePermissions('customer.archive')
  reactivate(@AuthUser() user: AuthUserType, @Param() param: CustomerIdParam, @Req() req: AppRequest) {
    return this.customers.reactivate(user, param.id, metaFromRequest(req));
  }

  @Get(':id/bills')
  @RequirePermissions('bill.read')
  bills(@AuthUser() user: AuthUserType, @Param() param: CustomerIdParam) {
    return this.customers.bills(user.organizationId, user, param.id);
  }

  @Get(':id/payments')
  @RequirePermissions('payment.read')
  payments(@AuthUser() user: AuthUserType, @Param() param: CustomerIdParam) {
    return this.customers.payments(user.organizationId, user, param.id);
  }

  @Get(':id/subscriptions')
  @RequirePermissions('subscription.read')
  subscriptions(@AuthUser() user: AuthUserType, @Param() param: CustomerIdParam) {
    return this.customers.subscriptions(user.organizationId, user, param.id);
  }

  @Get(':id/activity')
  @RequirePermissions('customer.read')
  activity(@AuthUser() user: AuthUserType, @Param() param: CustomerIdParam) {
    return this.customers.activity(user.organizationId, user, param.id);
  }
}
