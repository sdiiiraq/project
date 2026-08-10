import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { BillingConfigService } from './billing-config.service';
import { BillsService } from './bills.service';
import { AdjustBillDto, BillIdParam, BillingConfigDto, GenerateBillsDto, IssueBulkDto, ListBillsQuery, VoidBillDto } from './dto';

@Controller('bills')
export class BillsController {
  constructor(
    private readonly bills: BillsService,
    private readonly billingConfig: BillingConfigService,
  ) {}

  @Get()
  @RequirePermissions('bill.read')
  list(@AuthUser() user: AuthUserType, @Query() query: ListBillsQuery) {
    return this.bills.list(user.organizationId, user, query);
  }

  @Get('config')
  @RequirePermissions('settings.read')
  config(@AuthUser() user: AuthUserType) {
    return this.billingConfig.get(user.organizationId);
  }

  @Put('config')
  @RequirePermissions('settings.update')
  setConfig(@AuthUser() user: AuthUserType, @Body() dto: BillingConfigDto) {
    return this.billingConfig.set(user.organizationId, dto, user.userId);
  }

  @Get('runs')
  @RequirePermissions('bill.read')
  runs(@AuthUser() user: AuthUserType) {
    return this.bills.listRuns(user);
  }

  @Post('preview')
  @RequirePermissions('bill.create')
  preview(@AuthUser() user: AuthUserType, @Body() dto: GenerateBillsDto) {
    return this.bills.preview(user, dto);
  }

  @Post('generate')
  @HttpCode(201)
  @RequirePermissions('bill.create')
  generate(@AuthUser() user: AuthUserType, @Body() dto: GenerateBillsDto, @Req() req: AppRequest) {
    return this.bills.generate(user, dto, metaFromRequest(req));
  }

  @Post('issue-bulk')
  @RequirePermissions('bill.create')
  issueBulk(@AuthUser() user: AuthUserType, @Body() dto: IssueBulkDto, @Req() req: AppRequest) {
    return this.bills.issueBulk(user, dto.runId, metaFromRequest(req));
  }

  @Post('sweep-overdue')
  @RequirePermissions('bill.update')
  async sweep(@AuthUser() user: AuthUserType, @Req() req: AppRequest) {
    const marked = await this.bills.sweepOverdue(user.organizationId, user.userId, metaFromRequest(req));
    return { markedOverdue: marked };
  }

  @Get(':id')
  @RequirePermissions('bill.read')
  get(@AuthUser() user: AuthUserType, @Param() param: BillIdParam) {
    return this.bills.get(user.organizationId, user, param.id);
  }

  @Post(':id/issue')
  @RequirePermissions('bill.create')
  issue(@AuthUser() user: AuthUserType, @Param() param: BillIdParam, @Req() req: AppRequest) {
    return this.bills.issue(user, param.id, metaFromRequest(req));
  }

  @Post(':id/adjust')
  @RequirePermissions('bill.adjust')
  adjust(@AuthUser() user: AuthUserType, @Param() param: BillIdParam, @Body() dto: AdjustBillDto, @Req() req: AppRequest) {
    return this.bills.adjust(user, param.id, dto, metaFromRequest(req));
  }

  @Post('adjustments/:adjustmentId/approve')
  @RequirePermissions('bill.adjust')
  approve(@AuthUser() user: AuthUserType, @Param('adjustmentId') adjustmentId: string, @Req() req: AppRequest) {
    return this.bills.approveAdjustment(user, adjustmentId, metaFromRequest(req));
  }

  @Post(':id/void')
  @RequirePermissions('bill.void')
  void(@AuthUser() user: AuthUserType, @Param() param: BillIdParam, @Body() dto: VoidBillDto, @Req() req: AppRequest) {
    return this.bills.void(user, param.id, dto.reason, metaFromRequest(req));
  }

  @Get(':id/history')
  @RequirePermissions('bill.read')
  history(@AuthUser() user: AuthUserType, @Param() param: BillIdParam) {
    return this.bills.history(user.organizationId, user, param.id);
  }
}
