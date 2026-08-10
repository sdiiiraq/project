import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { CancelSubscriptionDto, CreateSubscriptionDto, ListSubscriptionsQuery, SubscriptionIdParam, UpdateSubscriptionDto } from './dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get()
  @RequirePermissions('subscription.read')
  list(@AuthUser() user: AuthUserType, @Query() query: ListSubscriptionsQuery) {
    return this.subscriptions.list(user.organizationId, user, query);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('subscription.create')
  create(@AuthUser() user: AuthUserType, @Body() dto: CreateSubscriptionDto, @Req() req: AppRequest) {
    return this.subscriptions.create(user, dto, metaFromRequest(req));
  }

  @Get(':id')
  @RequirePermissions('subscription.read')
  get(@AuthUser() user: AuthUserType, @Param() param: SubscriptionIdParam) {
    return this.subscriptions.get(user.organizationId, user, param.id);
  }

  @Patch(':id')
  @RequirePermissions('subscription.update')
  update(
    @AuthUser() user: AuthUserType,
    @Param() param: SubscriptionIdParam,
    @Body() dto: UpdateSubscriptionDto,
    @Req() req: AppRequest,
  ) {
    return this.subscriptions.update(user, param.id, dto, metaFromRequest(req));
  }

  @Post(':id/suspend')
  @RequirePermissions('subscription.update')
  suspend(@AuthUser() user: AuthUserType, @Param() param: SubscriptionIdParam, @Req() req: AppRequest) {
    return this.subscriptions.suspend(user, param.id, metaFromRequest(req));
  }

  @Post(':id/cancel')
  @RequirePermissions('subscription.cancel')
  cancel(
    @AuthUser() user: AuthUserType,
    @Param() param: SubscriptionIdParam,
    @Body() dto: CancelSubscriptionDto,
    @Req() req: AppRequest,
  ) {
    return this.subscriptions.cancel(user, param.id, dto, metaFromRequest(req));
  }

  @Post(':id/reactivate')
  @RequirePermissions('subscription.update')
  reactivate(@AuthUser() user: AuthUserType, @Param() param: SubscriptionIdParam, @Req() req: AppRequest) {
    return this.subscriptions.reactivate(user, param.id, metaFromRequest(req));
  }

  @Get(':id/history')
  @RequirePermissions('subscription.read')
  history(@AuthUser() user: AuthUserType, @Param() param: SubscriptionIdParam) {
    return this.subscriptions.history(user.organizationId, user, param.id);
  }
}
