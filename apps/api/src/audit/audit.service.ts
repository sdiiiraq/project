import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  /** تمرير معاملة قاعدة البيانات لضمان ذرية التدقيق مع العملية المالية (§206) */
  tx?: Prisma.TransactionClient;
}

/**
 * سجل التدقيق (§39). append-only من ناحية التطبيق.
 * يُكتب داخل نفس المعاملة مع التغييرات المالية المهمة (§206).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    const client = entry.tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        organizationId: entry.organizationId ?? null,
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        before: entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
        after: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
        metadata: entry.metadata === undefined ? undefined : (entry.metadata as Prisma.InputJsonValue),
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        requestId: entry.requestId ?? null,
      },
    });
  }

  async list(
    orgId: string,
    q: {
      page?: number;
      pageSize?: number;
      actorUserId?: string;
      action?: string;
      entityType?: string;
      entityId?: string;
      from?: string;
      to?: string;
    },
  ) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: orgId,
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.from || q.to
        ? { createdAt: { ...(q.from ? { gte: new Date(q.from) } : {}), ...(q.to ? { lte: new Date(q.to) } : {}) } }
        : {}),
    };
    const page = q.page ?? 1;
    const pageSize = Math.min(q.pageSize ?? 20, 100);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total } };
  }

  async distinctActions(orgId: string) {
    const grouped = await this.prisma.auditLog.groupBy({
      by: ['action'],
      where: { organizationId: orgId },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 100,
    });
    return grouped.map((g) => ({ action: g.action, count: g._count.id }));
  }
}
