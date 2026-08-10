import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { ResolveConflictDto, SyncPushDto, SyncStatusQuery } from './dto';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  @HttpCode(200)
  @RequirePermissions('payment.create')
  push(@AuthUser() user: AuthUserType, @Body() dto: SyncPushDto, @Req() req: AppRequest) {
    return this.sync.push(user, dto, metaFromRequest(req));
  }

  @Get('pull')
  @RequirePermissions('collection.read')
  pull(@AuthUser() user: AuthUserType) {
    return this.sync.pull(user);
  }

  @Post('resolve-conflict')
  @RequirePermissions('collection.reconcile')
  resolveConflict(@AuthUser() user: AuthUserType, @Body() dto: ResolveConflictDto, @Req() req: AppRequest) {
    return this.sync.resolveConflict(user, dto, metaFromRequest(req));
  }

  @Get('status')
  @RequirePermissions('collection.read')
  status(@AuthUser() user: AuthUserType, @Query() query: SyncStatusQuery) {
    return this.sync.status(user, query);
  }
}
