import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AuthUser as AuthUserType, AppRequest } from '../common/types';
import { CreateUserDto, UpdateUserStatusDto } from './dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('user.read')
  list(@AuthUser() user: AuthUserType) {
    return this.users.list(user.organizationId);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('user.create')
  create(@AuthUser() user: AuthUserType, @Body() dto: CreateUserDto, @Req() req: AppRequest) {
    return this.users.create(user, dto, metaFromRequest(req));
  }

  @Patch(':id/status')
  @RequirePermissions('user.disable')
  updateStatus(
    @AuthUser() user: AuthUserType,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
    @Req() req: AppRequest,
  ) {
    return this.users.updateStatus(user, id, dto, metaFromRequest(req));
  }
}

@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('role.manage')
  list() {
    return this.users.listRoles();
  }
}
