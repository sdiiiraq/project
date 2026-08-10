import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import {
  ChangeOperatingStatusDto, CreateActivityDto, CreateOilChangeDto, EndOutageDto, IdParam,
  OutageQuery, RuntimeQuery, StartOutageDto, StartRuntimeDto, StopRuntimeDto,
} from './dto';
import { OperationsService } from './operations.service';

@Controller('operations')
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('runtime')
  @RequirePermissions('operations.read')
  listRuntime(@AuthUser() user: AuthUserType, @Query() query: RuntimeQuery) {
    return this.operations.listRuntime(user, query);
  }

  @Post('runtime')
  @HttpCode(201)
  @RequirePermissions('operations.create')
  startRuntime(@AuthUser() user: AuthUserType, @Body() dto: StartRuntimeDto, @Req() req: AppRequest) {
    return this.operations.startRuntime(user, dto, metaFromRequest(req));
  }

  @Post('runtime/:id/stop')
  @RequirePermissions('operations.update')
  stopRuntime(@AuthUser() user: AuthUserType, @Param() param: IdParam, @Body() dto: StopRuntimeDto, @Req() req: AppRequest) {
    return this.operations.stopRuntime(user, param.id, dto, metaFromRequest(req));
  }

  @Get('outages')
  @RequirePermissions('operations.read')
  listOutages(@AuthUser() user: AuthUserType, @Query() query: OutageQuery) {
    return this.operations.listOutages(user, query);
  }

  @Post('outages')
  @HttpCode(201)
  @RequirePermissions('operations.create')
  startOutage(@AuthUser() user: AuthUserType, @Body() dto: StartOutageDto, @Req() req: AppRequest) {
    return this.operations.startOutage(user, dto, metaFromRequest(req));
  }

  @Post('outages/:id/end')
  @RequirePermissions('operations.update')
  endOutage(@AuthUser() user: AuthUserType, @Param() param: IdParam, @Body() dto: EndOutageDto, @Req() req: AppRequest) {
    return this.operations.endOutage(user, param.id, dto, metaFromRequest(req));
  }

  @Post('status')
  @RequirePermissions('operations.update')
  changeStatus(@AuthUser() user: AuthUserType, @Body() dto: ChangeOperatingStatusDto, @Req() req: AppRequest) {
    return this.operations.changeOperatingStatus(user, dto, metaFromRequest(req));
  }

  @Get('activities')
  @RequirePermissions('operations.read')
  listActivities(@AuthUser() user: AuthUserType, @Query('generatorId') generatorId?: string) {
    return this.operations.listActivities(user, generatorId);
  }

  @Post('activities')
  @HttpCode(201)
  @RequirePermissions('operations.create')
  createActivity(@AuthUser() user: AuthUserType, @Body() dto: CreateActivityDto, @Req() req: AppRequest) {
    return this.operations.createActivity(user, dto, metaFromRequest(req));
  }

  @Get('oil-changes')
  @RequirePermissions('operations.read')
  listOilChanges(@AuthUser() user: AuthUserType, @Query('generatorId') generatorId?: string) {
    return this.operations.listOilChanges(user, generatorId);
  }

  @Post('oil-changes')
  @HttpCode(201)
  @RequirePermissions('operations.create')
  createOilChange(@AuthUser() user: AuthUserType, @Body() dto: CreateOilChangeDto, @Req() req: AppRequest) {
    return this.operations.createOilChange(user, dto, metaFromRequest(req));
  }
}
