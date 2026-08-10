import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { AuthUser, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { CreateGeneratorDto, GeneratorIdParam, ListGeneratorsQuery, UpdateGeneratorDto } from './dto';
import { GeneratorsService } from './generators.service';

@Controller('generators')
export class GeneratorsController {
  constructor(private readonly generators: GeneratorsService) {}

  @Get()
  @RequirePermissions('generator.read')
  list(@AuthUser() user: AuthUserType, @Query() query: ListGeneratorsQuery) {
    return this.generators.list(user.organizationId, user, query);
  }

  @Post()
  @HttpCode(201)
  @RequirePermissions('generator.create')
  create(@AuthUser() user: AuthUserType, @Body() dto: CreateGeneratorDto, @Req() req: AppRequest) {
    return this.generators.create(user, dto, metaFromRequest(req));
  }

  @Get(':id')
  @RequirePermissions('generator.read')
  get(@AuthUser() user: AuthUserType, @Param() param: GeneratorIdParam) {
    return this.generators.get(user.organizationId, user, param.id);
  }

  @Get(':id/dashboard')
  @RequirePermissions('generator.read')
  dashboard(@AuthUser() user: AuthUserType, @Param() param: GeneratorIdParam) {
    return this.generators.dashboard(user.organizationId, user, param.id);
  }

  @Get(':id/activity')
  @RequirePermissions('generator.read')
  activity(@AuthUser() user: AuthUserType, @Param() param: GeneratorIdParam) {
    return this.generators.activity(user.organizationId, user, param.id);
  }

  @Patch(':id')
  @RequirePermissions('generator.update')
  update(
    @AuthUser() user: AuthUserType,
    @Param() param: GeneratorIdParam,
    @Body() dto: UpdateGeneratorDto,
    @Req() req: AppRequest,
  ) {
    return this.generators.update(user, param.id, dto, metaFromRequest(req));
  }

  @Delete(':id')
  @RequirePermissions('generator.delete')
  archive(@AuthUser() user: AuthUserType, @Param() param: GeneratorIdParam, @Req() req: AppRequest) {
    return this.generators.archive(user, param.id, metaFromRequest(req));
  }
}
