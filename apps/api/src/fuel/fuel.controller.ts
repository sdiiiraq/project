import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import {
  AdjustInventoryDto, AnalyticsQuery, ConsumptionQuery, CreateConsumptionDto, CreatePurchaseDto,
  CreateSupplierDto, FuelConfigDto, IdParam, InventoryQuery, PurchaseQuery, RejectPurchaseDto, UpdateSupplierDto,
} from './dto';
import { FuelService } from './fuel.service';

@Controller('fuel')
export class FuelController {
  constructor(private readonly fuel: FuelService) {}

  @Get('config')
  @RequirePermissions('fuel.read')
  config(@AuthUser() user: AuthUserType) {
    return this.fuel.getFuelConfig(user.organizationId);
  }

  @Put('config')
  @RequirePermissions('fuel.approve')
  setConfig(@AuthUser() user: AuthUserType, @Body() dto: FuelConfigDto, @Req() req: AppRequest) {
    return this.fuel.setFuelConfig(user, dto, metaFromRequest(req));
  }

  @Get('suppliers')
  @RequirePermissions('fuel.read')
  suppliers(@AuthUser() user: AuthUserType) {
    return this.fuel.listSuppliers(user);
  }

  @Post('suppliers')
  @HttpCode(201)
  @RequirePermissions('fuel.create')
  createSupplier(@AuthUser() user: AuthUserType, @Body() dto: CreateSupplierDto, @Req() req: AppRequest) {
    return this.fuel.createSupplier(user, dto, metaFromRequest(req));
  }

  @Patch('suppliers/:id')
  @RequirePermissions('fuel.update')
  updateSupplier(@AuthUser() user: AuthUserType, @Param() param: IdParam, @Body() dto: UpdateSupplierDto, @Req() req: AppRequest) {
    return this.fuel.updateSupplier(user, param.id, dto, metaFromRequest(req));
  }

  @Get('purchases')
  @RequirePermissions('fuel.read')
  purchases(@AuthUser() user: AuthUserType, @Query() query: PurchaseQuery) {
    return this.fuel.listPurchases(user, query);
  }

  @Post('purchases')
  @HttpCode(201)
  @RequirePermissions('fuel.create')
  createPurchase(@AuthUser() user: AuthUserType, @Body() dto: CreatePurchaseDto, @Req() req: AppRequest) {
    return this.fuel.createPurchase(user, dto, metaFromRequest(req));
  }

  @Post('purchases/:id/approve')
  @RequirePermissions('fuel.approve')
  approve(@AuthUser() user: AuthUserType, @Param() param: IdParam, @Req() req: AppRequest) {
    return this.fuel.approvePurchase(user, param.id, metaFromRequest(req));
  }

  @Post('purchases/:id/reject')
  @RequirePermissions('fuel.approve')
  reject(@AuthUser() user: AuthUserType, @Param() param: IdParam, @Body() dto: RejectPurchaseDto, @Req() req: AppRequest) {
    return this.fuel.rejectPurchase(user, param.id, dto, metaFromRequest(req));
  }

  @Get('inventory')
  @RequirePermissions('fuel.read')
  inventory(@AuthUser() user: AuthUserType, @Query() query: InventoryQuery) {
    return this.fuel.getInventory(user, query);
  }

  @Post('inventory/adjust')
  @RequirePermissions('fuel.update')
  adjustInventory(@AuthUser() user: AuthUserType, @Body() dto: AdjustInventoryDto, @Req() req: AppRequest) {
    return this.fuel.adjustInventory(user, dto, metaFromRequest(req));
  }

  @Get('consumption')
  @RequirePermissions('fuel.read')
  consumption(@AuthUser() user: AuthUserType, @Query() query: ConsumptionQuery) {
    return this.fuel.listConsumption(user, query);
  }

  @Post('consumption')
  @HttpCode(201)
  @RequirePermissions('fuel.create')
  createConsumption(@AuthUser() user: AuthUserType, @Body() dto: CreateConsumptionDto, @Req() req: AppRequest) {
    return this.fuel.createConsumption(user, dto, metaFromRequest(req));
  }

  @Get('analytics')
  @RequirePermissions('fuel.read')
  analytics(@AuthUser() user: AuthUserType, @Query() query: AnalyticsQuery) {
    return this.fuel.getAnalytics(user, query);
  }
}
