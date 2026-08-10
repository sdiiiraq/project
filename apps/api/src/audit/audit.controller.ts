import { Controller, Get, Query } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import type { AuthUser as AuthUserType } from '../common/types';
import { AuditService } from './audit.service';
import { ListAuditQuery } from './dto';

/** سجل التدقيق للقراءة فقط (§115) — لا تعديل ولا حذف */
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.read')
  list(@AuthUser() user: AuthUserType, @Query() q: ListAuditQuery) {
    return this.audit.list(user.organizationId, q);
  }

  @Get('actions')
  @RequirePermissions('audit.read')
  actions(@AuthUser() user: AuthUserType) {
    return this.audit.distinctActions(user.organizationId);
  }
}
