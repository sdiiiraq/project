import {
  Controller, Delete, Get, HttpCode, Param, Post, Query, Req, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthUser, RawResponse, RequirePermissions } from '../common/decorators';
import { metaFromRequest } from '../common/types';
import type { AppRequest, AuthUser as AuthUserType } from '../common/types';
import { IdParam, ListFilesQuery, MAX_UPLOAD_BYTES, UploadFileQuery } from './dto';
import { FilesService } from './files.service';

@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @HttpCode(201)
  @RequirePermissions('file.upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @AuthUser() user: AuthUserType,
    @UploadedFile() file: Express.Multer.File,
    @Query() query: UploadFileQuery,
    @Req() req: AppRequest,
  ) {
    return this.files.upload(user, file, query.entityKind, query.entityId, metaFromRequest(req));
  }

  @Get()
  @RequirePermissions('file.read')
  list(@AuthUser() user: AuthUserType, @Query() query: ListFilesQuery) {
    return this.files.list(user.organizationId, query.entityKind, query.entityId);
  }

  @Get(':id/download')
  @RawResponse()
  @RequirePermissions('file.read')
  async download(@AuthUser() user: AuthUserType, @Param() param: IdParam, @Res() res: Response) {
    const { buffer, mimeType, originalName } = await this.files.download(user.organizationId, param.id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(originalName)}"`);
    res.send(buffer);
  }

  @Delete(':id')
  @RequirePermissions('file.upload')
  async remove(@AuthUser() user: AuthUserType, @Param() param: IdParam, @Req() req: AppRequest) {
    await this.files.remove(user, param.id, metaFromRequest(req));
    return { deleted: true };
  }
}
