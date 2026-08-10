import { Controller, Get, Param, Patch } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import type { AuthUser as AuthUserType } from '../common/types';
import { NotificationsService } from './notification.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermissions('organization.read')
  list(@AuthUser() user: AuthUserType) {
    return this.notifications.listForOrg(user.organizationId);
  }

  @Patch(':id/read')
  @RequirePermissions('organization.read')
  markRead(@AuthUser() user: AuthUserType, @Param('id') id: string) {
    return this.notifications.markRead(user.organizationId, id);
  }
}
