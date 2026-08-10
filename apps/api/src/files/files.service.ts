import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { StorageService } from '../common/storage.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from './dto';

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async upload(
    actor: AuthUser,
    file: Express.Multer.File,
    entityKind: string,
    entityId: string | undefined,
    meta: RequestMeta,
  ) {
    if (!file || !file.buffer || file.size === 0) {
      throw new AppException(ErrorCodes.FILE_INVALID, 'الملف مطلوب', 422);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new AppException(ErrorCodes.FILE_TOO_LARGE, 'حجم الملف يتجاوز الحد المسموح (10MB)', 422);
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new AppException(ErrorCodes.FILE_INVALID, 'نوع الملف غير مدعوم', 422);
    }

    const extension = EXTENSION_BY_MIME[file.mimetype] ?? 'bin';
    const objectKey = await this.storage.save(actor.organizationId, file.buffer, extension);

    return this.prisma.$transaction(async (tx) => {
      const stored = await tx.storedFile.create({
        data: {
          organizationId: actor.organizationId,
          entityKind,
          entityId,
          mimeType: file.mimetype,
          extension,
          sizeBytes: BigInt(file.size),
          objectKey,
          originalName: file.originalname,
          uploadedBy: actor.userId,
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'file.upload', entityType: 'StoredFile', entityId: stored.id,
        metadata: { entityKind, entityId }, meta,
      });
      return { ...stored, sizeBytes: stored.sizeBytes.toString() };
    });
  }

  async list(organizationId: string, entityKind: string, entityId?: string) {
    const files = await this.prisma.storedFile.findMany({
      where: { organizationId, entityKind, ...(entityId ? { entityId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return files.map((f) => ({ ...f, sizeBytes: f.sizeBytes.toString() }));
  }

  private async loadOwned(organizationId: string, id: string) {
    const file = await this.prisma.storedFile.findFirst({ where: { id, organizationId } });
    if (!file) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الملف غير موجود', 404);
    return file;
  }

  async download(organizationId: string, id: string): Promise<{ buffer: Buffer; mimeType: string; originalName: string }> {
    const file = await this.loadOwned(organizationId, id);
    const buffer = await this.storage.read(file.objectKey);
    return { buffer, mimeType: file.mimeType, originalName: file.originalName ?? `${file.id}.${file.extension}` };
  }

  async remove(actor: AuthUser, id: string, meta: RequestMeta) {
    const file = await this.loadOwned(actor.organizationId, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.storedFile.delete({ where: { id } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'file.delete', entityType: 'StoredFile', entityId: id, meta,
      });
    });
    await this.storage.delete(file.objectKey);
  }
}
