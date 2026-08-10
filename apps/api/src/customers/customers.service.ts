import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ArchiveReasonDto, CreateCustomerDto, ListCustomersQuery, UpdateCustomerDto } from './dto';

const VALID_BILL_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
  ) {}

  async list(orgId: string, user: AuthUser, query: ListCustomersQuery) {
    if (query.generatorId) {
      await this.scope.assertGeneratorAccess(orgId, user, query.generatorId);
    }
    const allowed = await this.scope.accessibleGeneratorIds(orgId, user);

    // المؤرشفون يُقرؤون عبر deletedAt غير فارغ؛ البقية عبر deletedAt فارغ (§90)
    const statusFilter: Prisma.CustomerWhereInput =
      query.status === 'ARCHIVED'
        ? { status: 'ARCHIVED', deletedAt: { not: null } }
        : { deletedAt: null, ...(query.status ? { status: query.status } : {}) };

    const where: Prisma.CustomerWhereInput = {
      organizationId: orgId,
      ...(allowed ? { generatorId: { in: allowed } } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...statusFilter,
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q } },
              { phonePrimary: { contains: query.q } },
              { customerNumber: { contains: query.q } },
            ],
          }
        : {}),
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        include: { generator: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total } };
  }

  /**
   * القراءة لا تستثني المؤرشف — التاريخ المالي يبقى متاحًا حتى بعد الأرشفة (§149).
   * الرصيد المستحق يُحسب من قاعدة البيانات، لا من الواجهة (§147).
   */
  async get(orgId: string, user: AuthUser, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: orgId },
      include: { generator: { select: { id: true, name: true } }, _count: { select: { subscriptions: true } } },
    });
    if (!customer) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المشترك غير موجود', 404);
    await this.scope.assertGeneratorAccess(orgId, user, customer.generatorId);

    const debt = await this.prisma.bill.aggregate({
      where: { customerId: id, organizationId: orgId, status: { in: [...VALID_BILL_STATUSES] } },
      _sum: { outstandingAmount: true },
    });

    return { ...customer, outstandingBalance: (debt._sum.outstandingAmount ?? 0).toString() };
  }

  /**
   * رقم المشترك تسلسلي فريد ضمن المولدة (§14).
   * يُحسب داخل المعاملة، والقيد الفريد في قاعدة البيانات خط الدفاع الأخير ضد السباق (§89).
   */
  private async nextCustomerNumber(tx: Prisma.TransactionClient, generatorId: string): Promise<string> {
    const rows = await tx.$queryRaw<{ max: number }[]>`
      SELECT COALESCE(MAX("customerNumber"::int), 1000) AS max
      FROM customers
      WHERE "generatorId" = ${generatorId}
    `;
    return String((rows[0]?.max ?? 1000) + 1);
  }

  async create(actor: AuthUser, dto: CreateCustomerDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const customerNumber = await this.nextCustomerNumber(tx, dto.generatorId);
          const customer = await tx.customer.create({
            data: { ...dto, organizationId: actor.organizationId, customerNumber },
            include: { generator: { select: { id: true, name: true } } },
          });
          await this.audit.log({
            tx, organizationId: actor.organizationId, actorUserId: actor.userId,
            action: 'customer.create', entityType: 'Customer', entityId: customer.id,
            after: { fullName: customer.fullName, customerNumber, generatorId: dto.generatorId },
            metadata: { generatorId: dto.generatorId }, meta,
          });
          return customer;
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 2) {
          continue; // إعادة المحاولة عند تعارض رقم المشترك
        }
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppException(ErrorCodes.DUPLICATE_RESOURCE, 'تعارض في رقم المشترك، حاول مجدداً', 409);
        }
        throw e;
      }
    }
    throw new AppException(ErrorCodes.INTERNAL_ERROR, 'تعذر إنشاء رقم المشترك', 500);
  }

  async update(actor: AuthUser, id: string, dto: UpdateCustomerDto, meta: RequestMeta) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!customer) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المشترك غير موجود', 404);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, customer.generatorId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({ where: { id }, data: { ...dto } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'customer.update', entityType: 'Customer', entityId: id,
        before: customer, after: updated, metadata: { generatorId: customer.generatorId }, meta,
      });
      return updated;
    });
  }

  async archive(actor: AuthUser, id: string, dto: ArchiveReasonDto, meta: RequestMeta) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!customer) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المشترك غير موجود', 404);
    if (customer.status === 'ARCHIVED' || customer.deletedAt) {
      throw new AppException(ErrorCodes.INVALID_STATE, 'المشترك مؤرشف بالفعل', 422);
    }
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, customer.generatorId);

    // يُسجل الرصيد القائم لحظة الأرشفة — الأرشفة لا تُسقط الديون (§118/§149)
    const debt = await this.prisma.bill.aggregate({
      where: { customerId: id, organizationId: actor.organizationId, status: { in: [...VALID_BILL_STATUSES] } },
      _sum: { outstandingAmount: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id },
        data: { status: 'ARCHIVED', deletedAt: new Date() },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'customer.archive', entityType: 'Customer', entityId: id,
        metadata: {
          generatorId: customer.generatorId,
          reason: dto.reason ?? null,
          outstandingAtArchive: (debt._sum.outstandingAmount ?? 0).toString(),
        },
        meta,
      });
      return { archived: true, id: updated.id };
    });
  }

  /** إعادة التنشيط مطلوبة قبل أي اشتراك جديد لمشترك مؤرشف (§112) */
  async reactivate(actor: AuthUser, id: string, meta: RequestMeta) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId: actor.organizationId },
    });
    if (!customer) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المشترك غير موجود', 404);
    if (customer.status !== 'ARCHIVED') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'المشترك ليس مؤرشفاً', 422);
    }
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, customer.generatorId);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id },
        data: { status: 'ACTIVE', deletedAt: null },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'customer.reactivate', entityType: 'Customer', entityId: id,
        metadata: { generatorId: customer.generatorId }, meta,
      });
      return updated;
    });
  }

  async bills(orgId: string, user: AuthUser, id: string) {
    await this.get(orgId, user, id); // فرض الوصول والوجود
    return this.prisma.bill.findMany({
      where: { customerId: id, organizationId: orgId },
      orderBy: { issueDate: 'desc' },
      take: 100,
    });
  }

  async payments(orgId: string, user: AuthUser, id: string) {
    await this.get(orgId, user, id);
    return this.prisma.payment.findMany({
      where: { customerId: id, organizationId: orgId },
      orderBy: { paymentDate: 'desc' },
      take: 100,
    });
  }

  async subscriptions(orgId: string, user: AuthUser, id: string) {
    await this.get(orgId, user, id);
    return this.prisma.subscription.findMany({
      where: { customerId: id, organizationId: orgId },
      include: { amperePlan: { select: { id: true, name: true, ampereAmount: true, price: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async activity(orgId: string, user: AuthUser, id: string) {
    await this.get(orgId, user, id);
    return this.prisma.auditLog.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { entityType: 'Customer', entityId: id },
          { metadata: { path: ['customerId'], equals: id } },
        ],
      },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }
}
