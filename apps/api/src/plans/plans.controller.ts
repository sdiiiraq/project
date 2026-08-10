import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { CreatePlanDto, PlanIdParam, RevisePlanDto } from './dto';
import { PlansService } from './plans.service';

/**
 * إدارة الخطط = إدارة التسعير → صلاحية generator.update
 * (افتراض موثق §0: لا توجد صلاحية plans.* مستقلة في §11)
 */
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  @RequirePermissions('generator.read')
  list(
    @AuthUser() user: AuthUserType,
    @Query('generatorId') generatorId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    if (!generatorId) return [];
    return this.plans.list(user.organizationId, user, generatorId, includeInactive === 'true');
  }

  @Get(':id')
  @RequirePermissions('generator.read')
  get(@AuthUser() user: AuthUserType, @Param() param: PlanIdParam) {
    return this.plans.get(user.organizationId, user, param.id);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('generator.update')
  create(@AuthUser() user: AuthUserType, @Body() dto: CreatePlanDto, @Req() req: AppRequest) {
    return this.plans.create(user, dto, metaFromRequest(req));
  }

  @Post(':id/revise')
  @RequirePermissions('generator.update')
  revise(
    @AuthUser() user: AuthUserType,
    @Param() param: PlanIdParam,
    @Body() dto: RevisePlanDto,
    @Req() req: AppRequest,
  ) {
    return this.plans.revise(user, param.id, dto, metaFromRequest(req));
  }
}
