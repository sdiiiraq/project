import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateOrganizationDto } from './dto';

/** مفاتيح الإعدادات على مستوى المنظمة (§54) — الإعدادات المتخصصة (فوترة/وقود/مصاريف) تُدار من وحداتها */
const ALLOWED_SETTING_KEYS = ['general', 'billing', 'notifications', 'receipts', 'security'] as const;
type SettingKey = (typeof ALLOWED_SETTING_KEYS)[number];

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getMine(organizationId: string) {
    // سياق المستأجر مشتق من الهوية المصادقة فقط (§9) — لا من مدخلات العميل
    const org = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!org) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المنظمة غير موجودة', 404);
    return org;
  }

  async updateMine(actor: AuthUser, dto: UpdateOrganizationDto, meta: RequestMeta) {
    const before = await this.getMine(actor.organizationId);
    return this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.update({
        where: { id: actor.organizationId },
        data: { ...dto },
      });
      await this.audit.log({
        tx, organizationId: org.id, actorUserId: actor.userId,
        action: 'organization.update', entityType: 'Organization', entityId: org.id,
        before, after: org, meta,
      });
      return org;
    });
  }

  async getSettings(organizationId: string) {
    const rows = await this.prisma.organizationSetting.findMany({ where: { organizationId } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async setSetting(actor: AuthUser, key: string, value: unknown, meta: RequestMeta) {
    if (!ALLOWED_SETTING_KEYS.includes(key as SettingKey)) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'مفتاح الإعدادات غير مسموح', 422);
    }
    if (value === null || typeof value !== 'object') {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'قيمة الإعداد يجب أن تكون كائناً JSON', 422);
    }

    return this.prisma.$transaction(async (tx) => {
      const setting = await tx.organizationSetting.upsert({
        where: { organizationId_key: { organizationId: actor.organizationId, key } },
        update: { value: value as Prisma.InputJsonValue, updatedBy: actor.userId },
        create: {
          organizationId: actor.organizationId,
          key,
          value: value as Prisma.InputJsonValue,
          updatedBy: actor.userId,
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'settings.update', entityType: 'OrganizationSetting', entityId: setting.id,
        after: { key, value }, meta,
      });
      return setting;
    });
  }
}
