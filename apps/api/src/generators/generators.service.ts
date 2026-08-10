import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGeneratorDto, ListGeneratorsQuery, UpdateGeneratorDto } from './dto';

const VALID_BILL_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const;

type OperatingStatus = 'ON' | 'OFF' | 'MAINTENANCE' | 'FAULT' | 'UNKNOWN';

@Injectable()
export class GeneratorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
  ) {}

  async list(orgId: string, user: AuthUser, query: ListGeneratorsQuery) {
    const allowed = await this.scope.accessibleGeneratorIds(orgId, user);
    const where: Prisma.GeneratorWhereInput = {
      organizationId: orgId,
      deletedAt: null,
      ...(allowed ? { id: { in: allowed } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? { OR: [{ name: { contains: query.q } }, { code: { contains: query.q } }] }
        : {}),
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.generator.findMany({
        where,
        include: { _count: { select: { customers: true, subscriptions: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.generator.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total } };
  }

  async get(orgId: string, user: AuthUser, id: string) {
    await this.scope.assertGeneratorAccess(orgId, user, id);
    return this.prisma.generator.findFirstOrThrow({
      where: { id, organizationId: orgId, deletedAt: null },
      include: { _count: { select: { customers: true, subscriptions: true } } },
    });
  }

  async create(actor: AuthUser, dto: CreateGeneratorDto, meta: RequestMeta) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const generator = await tx.generator.create({
          data: { ...dto, organizationId: actor.organizationId },
        });
        // المُنشئ من غير المالكين يحصل على نطاق وصول تلقائي للمولدة التي أنشأها
        if (!actor.roles.includes('ORGANIZATION_OWNER')) {
          await tx.generatorUserScope.create({ data: { userId: actor.userId, generatorId: generator.id } });
        }
        await this.audit.log({
          tx, organizationId: actor.organizationId, actorUserId: actor.userId,
          action: 'generator.create', entityType: 'Generator', entityId: generator.id,
          after: { name: generator.name, code: generator.code }, meta,
        });
        return generator;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AppException(ErrorCodes.DUPLICATE_RESOURCE, 'رمز المولدة مستخدم مسبقاً', 409);
      }
      throw e;
    }
  }

  async update(actor: AuthUser, id: string, dto: UpdateGeneratorDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, id);
    const before = await this.prisma.generator.findFirstOrThrow({
      where: { id, organizationId: actor.organizationId, deletedAt: null },
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.generator.update({ where: { id }, data: { ...dto } });

      // تسجيل انتقالات الحالة التشغيلية (§108) — لا نستنتج التشغيل من حضور الواجهة
      if (dto.operatingStatus && dto.operatingStatus !== before.operatingStatus) {
        await tx.generatorStatusTransition.create({
          data: {
            organizationId: actor.organizationId,
            generatorId: id,
            fromStatus: before.operatingStatus,
            toStatus: dto.operatingStatus as OperatingStatus,
            changedBy: actor.userId,
          },
        });
      }
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'generator.update', entityType: 'Generator', entityId: id,
        before, after: updated, meta,
      });
      return updated;
    });
  }

  /** حذف آمن = أرشفة (§90). التاريخ المالي يبقى محفوظًا (§149). */
  async archive(actor: AuthUser, id: string, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, id);
    const activeSubscriptions = await this.prisma.subscription.count({
      where: { generatorId: id, organizationId: actor.organizationId, status: 'ACTIVE' },
    });
    if (activeSubscriptions > 0) {
      throw new AppException(
        ErrorCodes.INVALID_STATE,
        `لا يمكن أرشفة المولدة قبل إنهاء الاشتراكات النشطة (${activeSubscriptions})`,
        422,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.generator.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'ARCHIVED' },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'generator.archive', entityType: 'Generator', entityId: id, meta,
      });
      return { archived: true, id: updated.id };
    });
  }

  /** مؤشرات المولدة — تُحسب من قاعدة البيانات مباشرة (§147: لا حساب مالي في الواجهة) */
  async dashboard(orgId: string, user: AuthUser, id: string) {
    await this.scope.assertGeneratorAccess(orgId, user, id);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [customers, activeSubscriptions, billAgg, overdueBills, monthPayments] = await Promise.all([
      this.prisma.customer.count({ where: { generatorId: id, organizationId: orgId, status: 'ACTIVE', deletedAt: null } }),
      this.prisma.subscription.count({ where: { generatorId: id, organizationId: orgId, status: 'ACTIVE' } }),
      this.prisma.bill.aggregate({
        where: { generatorId: id, organizationId: orgId, status: { in: [...VALID_BILL_STATUSES] } },
        _sum: { totalAmount: true, paidAmount: true, outstandingAmount: true },
      }),
      this.prisma.bill.count({ where: { generatorId: id, organizationId: orgId, status: 'OVERDUE' } }),
      this.prisma.payment.aggregate({
        where: { generatorId: id, organizationId: orgId, status: 'COMPLETED', paymentDate: { gte: monthStart } },
        _sum: { amount: true },
      }),
    ]);

    return {
      generatorId: id,
      customers,
      activeSubscriptions,
      overdueBills,
      billedTotal: (billAgg._sum.totalAmount ?? 0).toString(),
      collectedTotal: (billAgg._sum.paidAmount ?? 0).toString(),
      outstandingTotal: (billAgg._sum.outstandingAmount ?? 0).toString(),
      collectedThisMonth: (monthPayments._sum.amount ?? 0).toString(),
    };
  }

  async activity(orgId: string, user: AuthUser, id: string) {
    await this.scope.assertGeneratorAccess(orgId, user, id);
    return this.prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { entityType: 'Generator', entityId: id },
          { metadata: { path: ['generatorId'], equals: id } },
        ],
      },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
