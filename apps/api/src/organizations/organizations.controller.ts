import { Body, Controller, Get, Param, Patch, Put, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AuthUser as AuthUserType, AppRequest } from '../common/types';
import { UpdateOrganizationDto } from './dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgs: OrganizationsService) {}

  @Get('me')
  @RequirePermissions('organization.read')
  me(@AuthUser() user: AuthUserType) {
    return this.orgs.getMine(user.organizationId);
  }

  @Patch('me')
  @RequirePermissions('organization.update')
  update(@AuthUser() user: AuthUserType, @Body() dto: UpdateOrganizationDto, @Req() req: AppRequest) {
    return this.orgs.updateMine(user, dto, metaFromRequest(req));
  }

  @Get('settings')
  @RequirePermissions('settings.read')
  settings(@AuthUser() user: AuthUserType) {
    return this.orgs.getSettings(user.organizationId);
  }

  @Put('settings/:key')
  @RequirePermissions('settings.update')
  setSetting(
    @AuthUser() user: AuthUserType,
    @Param('key') key: string,
    @Body('value') value: unknown,
    @Req() req: AppRequest,
  ) {
    return this.orgs.setSetting(user, key, value, metaFromRequest(req));
  }
}
