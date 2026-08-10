import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException, ErrorCodes } from './errors';

/**
 * تجريد التخزين (§103).
 *  - 'local': محرك القرص المحلي — للتطوير فقط. لا يصلح على Vercel لأن نظام
 *    الملفات في الدوال اللاخادومية مؤقت (/tmp فقط، وغير مشترك بين الاستدعاءات
 *    أو النسخ) — أي ملف محفوظ محليًا يختفي عمليًا فور انتهاء الاستدعاء.
 *  - 'vercel-blob': محرك الإنتاج على Vercel، فوق خدمة Vercel Blob (تخزين
 *    كائنات دائم خارج نظام ملفات الدالة). يتطلب BLOB_READ_WRITE_TOKEN.
 * لا يوجد ادعاء نجاح كاذب لأي محرك قبل توفير بيانات اعتماد فعلية (§191).
 */
@Injectable()
export class StorageService {
  private readonly driver: string;
  private readonly localDir: string;

  constructor(private readonly config: ConfigService) {
    this.driver = this.config.get<string>('STORAGE_DRIVER') ?? 'local';
    this.localDir = this.config.get<string>('STORAGE_LOCAL_DIR') ?? './.storage';
  }

  private objectPath(objectKey: string): string {
    return path.resolve(this.localDir, objectKey);
  }

  private makeObjectKey(organizationId: string, extension: string): string {
    const safeExt = extension.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'bin';
    return `${organizationId}/${randomUUID()}.${safeExt}`;
  }

  /** يخزن الملف ويعيد مفتاح كائن فريد يُحفظ في StoredFile.objectKey */
  async save(organizationId: string, buffer: Buffer, extension: string): Promise<string> {
    const objectKey = this.makeObjectKey(organizationId, extension);

    if (this.driver === 'vercel-blob') {
      const token = this.config.get<string>('BLOB_READ_WRITE_TOKEN');
      if (!token) {
        throw new AppException(
          ErrorCodes.EXTERNAL_SERVICE_ERROR,
          'محرك التخزين vercel-blob غير مُهيأ — BLOB_READ_WRITE_TOKEN مفقود',
          501,
        );
      }
      const { put } = await import('@vercel/blob');
      await put(objectKey, buffer, { access: 'public', token, addRandomSuffix: false });
      return objectKey;
    }

    if (this.driver !== 'local') {
      throw new AppException(ErrorCodes.EXTERNAL_SERVICE_ERROR, 'محرك التخزين غير مدعوم في هذه البيئة', 501);
    }
    const fullPath = this.objectPath(objectKey);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer);
    return objectKey;
  }

  async read(objectKey: string): Promise<Buffer> {
    if (this.driver === 'vercel-blob') {
      const token = this.config.get<string>('BLOB_READ_WRITE_TOKEN');
      if (!token) {
        throw new AppException(
          ErrorCodes.EXTERNAL_SERVICE_ERROR,
          'محرك التخزين vercel-blob غير مُهيأ — BLOB_READ_WRITE_TOKEN مفقود',
          501,
        );
      }
      const { head } = await import('@vercel/blob');
      try {
        const meta = await head(objectKey, { token });
        const res = await fetch(meta.url);
        if (!res.ok) throw new Error(`blob fetch failed: ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      } catch {
        throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الملف غير موجود في التخزين', 404);
      }
    }

    if (this.driver !== 'local') {
      throw new AppException(ErrorCodes.EXTERNAL_SERVICE_ERROR, 'محرك التخزين غير مدعوم في هذه البيئة', 501);
    }
    try {
      return await fs.readFile(this.objectPath(objectKey));
    } catch {
      throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الملف غير موجود في التخزين', 404);
    }
  }

  async delete(objectKey: string): Promise<void> {
    if (this.driver === 'vercel-blob') {
      const token = this.config.get<string>('BLOB_READ_WRITE_TOKEN');
      if (!token) return;
      const { del } = await import('@vercel/blob');
      try {
        await del(objectKey, { token });
      } catch {
        // الملف غير موجود مسبقًا — لا يعتبر خطأ (idempotent)
      }
      return;
    }

    if (this.driver !== 'local') return;
    try {
      await fs.unlink(this.objectPath(objectKey));
    } catch {
      // الملف غير موجود مسبقًا — لا يعتبر خطأ (idempotent)
    }
  }
}
