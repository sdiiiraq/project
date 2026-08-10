import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import type { AuthUser as AuthUserType } from '../common/types';
import { ReportRangeQuery } from './dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('revenue')
  @RequirePermissions('reports.read')
  revenue(@AuthUser() user: AuthUserType, @Query() query: ReportRangeQuery) {
    return this.reports.revenue(user, query);
  }

  @Get('outstanding')
  @RequirePermissions('reports.read')
  outstanding(@AuthUser() user: AuthUserType, @Query() query: ReportRangeQuery) {
    return this.reports.outstanding(user, query);
  }

  @Get('profitability')
  @RequirePermissions('financial_reports.read')
  profitability(@AuthUser() user: AuthUserType, @Query() query: ReportRangeQuery) {
    return this.reports.profitability(user, query);
  }
}
