import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { CreateCategoryDto, CreateExpenseDto, ExpenseQuery, IdParam, RejectExpenseDto, UpdateExpenseDto } from './dto';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get('categories')
  @RequirePermissions('expense.read')
  categories(@AuthUser() user: AuthUserType) {
    return this.expenses.listCategories(user.organizationId);
  }

  @Post('categories')
  @HttpCode(201)
  @RequirePermissions('expense.update')
  createCategory(@AuthUser() user: AuthUserType, @Body() dto: CreateCategoryDto, @Req() req: AppRequest) {
    return this.expenses.createCategory(user, dto, metaFromRequest(req));
  }

  @Get()
  @RequirePermissions('expense.read')
  list(@AuthUser() user: AuthUserType, @Query() query: ExpenseQuery) {
    return this.expenses.list(user, query);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('expense.create')
  create(@AuthUser() user: AuthUserType, @Body() dto: CreateExpenseDto, @Req() req: AppRequest) {
    return this.expenses.create(user, dto, metaFromRequest(req));
  }

  @Get(':id')
  @RequirePermissions('expense.read')
  get(@AuthUser() user: AuthUserType, @Param() param: IdParam) {
    return this.expenses.get(user, param.id);
  }

  @Patch(':id')
  @RequirePermissions('expense.update')
  update(@AuthUser() user: AuthUserType, @Param() param: IdParam, @Body() dto: UpdateExpenseDto, @Req() req: AppRequest) {
    return this.expenses.update(user, param.id, dto, metaFromRequest(req));
  }

  @Post(':id/approve')
  @RequirePermissions('expense.approve')
  approve(@AuthUser() user: AuthUserType, @Param() param: IdParam, @Req() req: AppRequest) {
    return this.expenses.approve(user, param.id, metaFromRequest(req));
  }

  @Post(':id/reject')
  @RequirePermissions('expense.approve')
  reject(@AuthUser() user: AuthUserType, @Param() param: IdParam, @Body() dto: RejectExpenseDto, @Req() req: AppRequest) {
    return this.expenses.reject(user, param.id, dto, metaFromRequest(req));
  }
}
