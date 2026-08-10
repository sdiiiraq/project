import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { CreateEmployeeDto, EmployeeIdParam, EmployeeQuery, UpdateEmployeeDto } from './dto';
import { EmployeesService } from './employees.service';

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Get()
  @RequirePermissions('employee.read')
  list(@AuthUser() user: AuthUserType, @Query() query: EmployeeQuery) {
    return this.employees.list(user, query);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('employee.create')
  create(@AuthUser() user: AuthUserType, @Body() dto: CreateEmployeeDto, @Req() req: AppRequest) {
    return this.employees.create(user, dto, metaFromRequest(req));
  }

  @Get(':id')
  @RequirePermissions('employee.read')
  get(@AuthUser() user: AuthUserType, @Param() param: EmployeeIdParam) {
    return this.employees.get(user, param.id);
  }

  @Patch(':id')
  @RequirePermissions('employee.update')
  update(@AuthUser() user: AuthUserType, @Param() param: EmployeeIdParam, @Body() dto: UpdateEmployeeDto, @Req() req: AppRequest) {
    return this.employees.update(user, param.id, dto, metaFromRequest(req));
  }
}
