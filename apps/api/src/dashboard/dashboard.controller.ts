import { Controller, Get } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import type { AuthUser as AuthUserType } from '../common/types';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @RequirePermissions('reports.read')
  overview(@AuthUser() user: AuthUserType) {
    return this.dashboard.overview(user);
  }
}
