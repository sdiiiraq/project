import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { AddPartDto, CompleteMaintenanceDto, CreateMaintenanceDto, CreateSparePartDto, MaintenanceIdParam, MaintenanceQuery, UpdateMaintenanceDto } from './dto';
import { MaintenanceService } from './maintenance.service';

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceService) {}

  @Get()
  @RequirePermissions('maintenance.read')
  list(@AuthUser() user: AuthUserType, @Query() query: MaintenanceQuery) {
    return this.maintenance.list(user, query);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('maintenance.create')
  create(@AuthUser() user: AuthUserType, @Body() dto: CreateMaintenanceDto, @Req() req: AppRequest) {
    return this.maintenance.create(user, dto, metaFromRequest(req));
  }

  @Get('spare-parts')
  @RequirePermissions('maintenance.read')
  spareParts(@AuthUser() user: AuthUserType) {
    return this.maintenance.listSpareParts(user);
  }

  @Post('spare-parts')
  @HttpCode(201)
  @RequirePermissions('maintenance.create')
  createSparePart(@AuthUser() user: AuthUserType, @Body() dto: CreateSparePartDto, @Req() req: AppRequest) {
    return this.maintenance.createSparePart(user, dto, metaFromRequest(req));
  }

  @Get(':id')
  @RequirePermissions('maintenance.read')
  get(@AuthUser() user: AuthUserType, @Param() param: MaintenanceIdParam) {
    return this.maintenance.get(user, param.id);
  }

  @Patch(':id')
  @RequirePermissions('maintenance.update')
  update(@AuthUser() user: AuthUserType, @Param() param: MaintenanceIdParam, @Body() dto: UpdateMaintenanceDto, @Req() req: AppRequest) {
    return this.maintenance.update(user, param.id, dto, metaFromRequest(req));
  }

  @Post(':id/start')
  @RequirePermissions('maintenance.update')
  start(@AuthUser() user: AuthUserType, @Param() param: MaintenanceIdParam, @Req() req: AppRequest) {
    return this.maintenance.start(user, param.id, metaFromRequest(req));
  }

  @Post(':id/complete')
  @RequirePermissions('maintenance.update')
  complete(@AuthUser() user: AuthUserType, @Param() param: MaintenanceIdParam, @Body() dto: CompleteMaintenanceDto, @Req() req: AppRequest) {
    return this.maintenance.complete(user, param.id, dto, metaFromRequest(req));
  }

  @Post(':id/cancel')
  @RequirePermissions('maintenance.update')
  cancel(@AuthUser() user: AuthUserType, @Param() param: MaintenanceIdParam, @Req() req: AppRequest) {
    return this.maintenance.cancel(user, param.id, metaFromRequest(req));
  }

  @Post(':id/parts')
  @HttpCode(201)
  @RequirePermissions('maintenance.update')
  addPart(@AuthUser() user: AuthUserType, @Param() param: MaintenanceIdParam, @Body() dto: AddPartDto, @Req() req: AppRequest) {
    return this.maintenance.addPart(user, param.id, dto, metaFromRequest(req));
  }

  @Post(':id/parts/:sparePartId/remove')
  @RequirePermissions('maintenance.update')
  removePart(@AuthUser() user: AuthUserType, @Param() param: MaintenanceIdParam, @Param('sparePartId') sparePartId: string, @Req() req: AppRequest) {
    return this.maintenance.removePart(user, param.id, sparePartId, metaFromRequest(req));
  }
}
