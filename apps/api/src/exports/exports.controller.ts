import { Body, Controller, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthUser, RawResponse, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { CreateExportDto, IdParam } from './dto';
import { ExportsService } from './exports.service';

@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions('export.create')
  create(@AuthUser() user: AuthUserType, @Body() dto: CreateExportDto, @Req() req: AppRequest) {
    return this.exports.create(user, dto, metaFromRequest(req));
  }

  @Get()
  @RequirePermissions('export.read')
  list(@AuthUser() user: AuthUserType) {
    return this.exports.list(user.organizationId, user.userId);
  }

  @Get(':id/download')
  @RawResponse()
  @RequirePermissions('export.read')
  async download(@AuthUser() user: AuthUserType, @Param() param: IdParam, @Res() res: Response) {
    const { buffer, mimeType, originalName } = await this.exports.download(user.organizationId, param.id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
    res.send(buffer);
  }
}
