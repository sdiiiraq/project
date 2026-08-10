import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfig, DEFAULT_BILLING_CONFIG } from './billing.engine';

/** إعدادات الفوترة على مستوى المنظمة (مفتاح 'billing') — قابلة للتكوين (§18) */
@Injectable()
export class BillingConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(organizationId: string): Promise<BillingConfig> {
    const row = await this.prisma.organizationSetting.findUnique({
      where: { organizationId_key: { organizationId, key: 'billing' } },
    });
    const stored = (row?.value ?? {}) as Partial<BillingConfig>;
    return {
      ...DEFAULT_BILLING_CONFIG,
      ...stored,
      latePenalty: { ...DEFAULT_BILLING_CONFIG.latePenalty, ...(stored.latePenalty ?? {}) },
    };
  }

  async set(organizationId: string, value: Partial<BillingConfig>, actorUserId?: string): Promise<BillingConfig> {
    const merged = await this.get(organizationId);
    const next: BillingConfig = {
      ...merged,
      ...value,
      latePenalty: { ...merged.latePenalty, ...(value.latePenalty ?? {}) },
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.organizationSetting.upsert({
        where: { organizationId_key: { organizationId, key: 'billing' } },
        update: { value: next as unknown as Prisma.InputJsonValue, updatedBy: actorUserId },
        create: { organizationId, key: 'billing', value: next as unknown as Prisma.InputJsonValue, updatedBy: actorUserId },
      });
      await this.audit.log({
        tx, organizationId, actorUserId,
        action: 'settings.update', entityType: 'OrganizationSetting',
        after: { key: 'billing', value: next },
      });
    });
    return next;
  }
}
