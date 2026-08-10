import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { CollectionsService } from './collections.service';
import {
  AssignmentIdParam, CollectorIdParam, CollectorPaymentDto, CreateAssignmentDto, CreateCollectorDto,
  ListSessionsQuery, OpenSessionDto, ReconcileSessionDto, SessionIdParam, SubmitSessionDto, UpdateCollectorDto,
} from './dto';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  @RequirePermissions('collection.read')
  dashboard(@AuthUser() user: AuthUserType) {
    return this.collections.dashboard(user.organizationId, user);
  }

  @Get('my-customers')
  @RequirePermissions('collection.read')
  myCustomers(@AuthUser() user: AuthUserType) {
    return this.collections.myCustomers(user.organizationId, user);
  }

  @Post('payment')
  @HttpCode(201)
  @RequirePermissions('payment.create')
  recordPayment(
    @AuthUser() user: AuthUserType,
    @Body() dto: CollectorPaymentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: AppRequest,
  ) {
    return this.collections.recordPayment(user, dto, metaFromRequest(req), idempotencyKey);
  }

  // --- الجلسات ---
  @Get('sessions')
  @RequirePermissions('collection.read')
  sessions(@AuthUser() user: AuthUserType, @Query() query: ListSessionsQuery) {
    return this.collections.listSessions(user.organizationId, user, query);
  }

  @Post('sessions')
  @HttpCode(201)
  @RequirePermissions('collection.create')
  openSession(@AuthUser() user: AuthUserType, @Body() dto: OpenSessionDto, @Req() req: AppRequest) {
    return this.collections.openSession(user, dto, metaFromRequest(req));
  }

  @Post('sessions/:id/submit')
  @RequirePermissions('collection.create')
  submit(
    @AuthUser() user: AuthUserType,
    @Param() param: SessionIdParam,
    @Body() dto: SubmitSessionDto,
    @Req() req: AppRequest,
  ) {
    return this.collections.submitSession(user, param.id, dto, metaFromRequest(req));
  }

  @Post('sessions/:id/reconcile')
  @RequirePermissions('collection.reconcile')
  reconcile(
    @AuthUser() user: AuthUserType,
    @Param() param: SessionIdParam,
    @Body() dto: ReconcileSessionDto,
    @Req() req: AppRequest,
  ) {
    return this.collections.reconcileSession(user, param.id, dto, metaFromRequest(req));
  }

  @Post('sessions/:id/approve')
  @RequirePermissions('collection.approve')
  approve(@AuthUser() user: AuthUserType, @Param() param: SessionIdParam, @Req() req: AppRequest) {
    return this.collections.approveSession(user, param.id, metaFromRequest(req));
  }

  // --- الجباة ---
  @Get('collectors')
  @RequirePermissions('collection.read')
  collectors(@AuthUser() user: AuthUserType) {
    return this.collections.listCollectors(user.organizationId);
  }

  @Post('collectors')
  @HttpCode(201)
  @RequirePermissions('collection.create')
  createCollector(@AuthUser() user: AuthUserType, @Body() dto: CreateCollectorDto, @Req() req: AppRequest) {
    return this.collections.createCollector(user, dto, metaFromRequest(req));
  }

  @Patch('collectors/:id')
  @RequirePermissions('collection.create')
  updateCollector(
    @AuthUser() user: AuthUserType,
    @Param() param: CollectorIdParam,
    @Body() dto: UpdateCollectorDto,
    @Req() req: AppRequest,
  ) {
    return this.collections.updateCollector(user, param.id, dto, metaFromRequest(req));
  }

  // --- التعيينات ---
  @Get('assignments')
  @RequirePermissions('collection.read')
  assignments(@AuthUser() user: AuthUserType, @Query('collectorId') collectorId?: string) {
    return this.collections.listAssignments(user.organizationId, collectorId);
  }

  @Post('assignments')
  @HttpCode(201)
  @RequirePermissions('collection.create')
  createAssignment(@AuthUser() user: AuthUserType, @Body() dto: CreateAssignmentDto, @Req() req: AppRequest) {
    return this.collections.createAssignment(user, dto, metaFromRequest(req));
  }

  @Post('assignments/:id/end')
  @RequirePermissions('collection.create')
  endAssignment(@AuthUser() user: AuthUserType, @Param() param: AssignmentIdParam, @Req() req: AppRequest) {
    return this.collections.endAssignment(user, param.id, metaFromRequest(req));
  }
}
