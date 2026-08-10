import { Injectable } from '@nestjs/common';
import { Decimal, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CollectorPaymentDto, CreateAssignmentDto, CreateCollectorDto, ListSessionsQuery,
  OpenSessionDto, ReconcileSessionDto, SubmitSessionDto, UpdateCollectorDto,
} from './dto';

const PAYABLE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const;

function startOfTodayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
    private readonly payments: PaymentsService,
  ) {}

  private async resolveCollector(orgId: string, userId: string) {
    return this.prisma.collector.findFirst({ where: { organizationId: orgId, userId } });
  }

  // ============================================================
  // لوحة التحصيل (§48)
  // ============================================================
  async dashboard(orgId: string, user: AuthUser) {
    if (user.roles.includes('COLLECTOR') && !user.roles.some((r) => ['ORGANIZATION_OWNER', 'GENERATOR_OWNER', 'GENERATOR_MANAGER', 'ACCOUNTANT', 'SUPER_ADMIN'].includes(r))) {
      // الجابي لا يرى لوحة المؤسسة المالية (§12)
      throw new AppException(ErrorCodes.INSUFFICIENT_PERMISSION, 'لوحة التحصيل غير متاحة لهذا الدور', 403);
    }
    const allowed = await this.scope.accessibleGeneratorIds(orgId, user);
    const genFilter: Prisma.BillWhereInput['generatorId'] = allowed ? { in: allowed } : undefined;

    const startToday = startOfTodayUTC();
    const endToday = new Date(startToday.getTime() + 86_400_000);

    const [collectedToday, outstandingAgg, overdueAgg, dueTodayAgg, sessions] = await Promise.all([
      this.prisma.payment.aggregate({
        where: { organizationId: orgId, ...(genFilter ? { generatorId: genFilter } : {}), status: 'COMPLETED', paymentDate: { gte: startToday, lt: endToday } },
        _sum: { amount: true },
      }),
      this.prisma.bill.aggregate({
        where: { organizationId: orgId, ...(genFilter ? { generatorId: genFilter } : {}), status: { in: [...PAYABLE_STATUSES] } },
        _sum: { outstandingAmount: true },
      }),
      this.prisma.bill.aggregate({
        where: { organizationId: orgId, ...(genFilter ? { generatorId: genFilter } : {}), status: 'OVERDUE' },
        _sum: { outstandingAmount: true },
      }),
      this.prisma.bill.aggregate({
        where: { organizationId: orgId, ...(genFilter ? { generatorId: genFilter } : {}), status: { in: [...PAYABLE_STATUSES] }, dueDate: { gte: startToday, lt: endToday } },
        _sum: { outstandingAmount: true },
      }),
      this.prisma.collectionSession.groupBy({
        by: ['status'],
        where: { organizationId: orgId },
        _count: { id: true },
      }),
    ]);

    const ranking = await this.prisma.payment.groupBy({
      by: ['collectorId'],
      where: {
        organizationId: orgId, ...(genFilter ? { generatorId: genFilter } : {}),
        status: 'COMPLETED', collectorId: { not: null }, paymentDate: { gte: startToday, lt: endToday },
      },
      _sum: { amount: true },
      _count: { id: true },
    });
    const collectorIds = ranking.map((r) => r.collectorId).filter((x): x is string => Boolean(x));
    const collectors = collectorIds.length
      ? await this.prisma.collector.findMany({ where: { id: { in: collectorIds } }, select: { id: true, name: true } })
      : [];
    const collectorName = new Map(collectors.map((c) => [c.id, c.name]));

    return {
      todayExpected: (dueTodayAgg._sum.outstandingAmount ?? new Decimal(0)).toFixed(),
      todayCollected: (collectedToday._sum.amount ?? new Decimal(0)).toFixed(),
      outstanding: (outstandingAgg._sum.outstandingAmount ?? new Decimal(0)).toFixed(),
      overdue: (overdueAgg._sum.outstandingAmount ?? new Decimal(0)).toFixed(),
      collectorRanking: ranking
        .map((r) => ({
          collectorId: r.collectorId,
          collectorName: collectorName.get(r.collectorId as string) ?? '—',
          collected: (r._sum.amount ?? new Decimal(0)).toFixed(),
          paymentsCount: r._count.id,
        }))
        .sort((a, b) => new Decimal(b.collected).sub(new Decimal(a.collected)).toNumber()),
      reconciliationStatus: Object.fromEntries(sessions.map((s) => [s.status, s._count.id])),
    };
  }

  // ============================================================
  // مشتركو الجابي (§25) — الجابي يرى فقط معينيه (§112/§12)
  // ============================================================
  async myCustomers(orgId: string, user: AuthUser) {
    const collector = await this.resolveCollector(orgId, user.userId);
    if (!collector) throw new AppException(ErrorCodes.FORBIDDEN, 'لا يوجد ملف جابٍ مرتبط بحسابك', 403);

    const assignments = await this.prisma.collectorAssignment.findMany({
      where: { organizationId: orgId, collectorId: collector.id, status: 'ACTIVE' },
      include: {
        customer: { include: { generator: { select: { id: true, name: true } } } },
        generator: { select: { id: true, name: true } },
      },
    });
    const customerIds = assignments.map((a) => a.customerId);
    if (customerIds.length === 0) return [];

    const [outstandingAgg, dueAgg] = await Promise.all([
      this.prisma.bill.groupBy({
        by: ['customerId'],
        where: { organizationId: orgId, customerId: { in: customerIds }, status: { in: [...PAYABLE_STATUSES] } },
        _sum: { outstandingAmount: true },
      }),
      this.prisma.bill.groupBy({
        by: ['customerId'],
        where: { organizationId: orgId, customerId: { in: customerIds }, status: { in: [...PAYABLE_STATUSES] } },
        _min: { dueDate: true },
      }),
    ]);
    const outstandingMap = new Map(outstandingAgg.map((o) => [o.customerId, o._sum.outstandingAmount ?? new Decimal(0)]));
    const dueMap = new Map(dueAgg.map((d) => [d.customerId, d._min.dueDate]));

    return assignments.map((a) => ({
      customerId: a.customerId,
      customerNumber: a.customer.customerNumber,
      fullName: a.customer.fullName,
      phonePrimary: a.customer.phonePrimary,
      address: a.customer.address,
      neighborhood: a.customer.neighborhood,
      generatorId: a.generatorId,
      generatorName: a.generator.name,
      outstandingBalance: (outstandingMap.get(a.customerId) ?? new Decimal(0)).toFixed(),
      earliestDueDate: dueMap.get(a.customerId) ?? null,
    }));
  }

  // ============================================================
  // تسجيل دفعة الجابي (§142/§143) — مرتبط بالجلسة
  // ============================================================
  private async computeExpectedForCollector(orgId: string, collectorId: string, generatorId: string): Promise<Decimal> {
    const assignments = await this.prisma.collectorAssignment.findMany({
      where: { organizationId: orgId, collectorId, generatorId, status: 'ACTIVE' },
      select: { customerId: true },
    });
    const customerIds = assignments.map((a) => a.customerId);
    if (customerIds.length === 0) return new Decimal(0);
    const agg = await this.prisma.bill.aggregate({
      where: { organizationId: orgId, customerId: { in: customerIds }, status: { in: [...PAYABLE_STATUSES] } },
      _sum: { outstandingAmount: true },
    });
    return agg._sum.outstandingAmount ?? new Decimal(0);
  }

  private async findOrCreateSession(actor: AuthUser, collectorId: string, generatorId: string) {
    const sessionDate = startOfTodayUTC();
    const existing = await this.prisma.collectionSession.findUnique({
      where: { collectorId_generatorId_sessionDate: { collectorId, generatorId, sessionDate } },
    });
    if (existing) return existing;
    const expected = await this.computeExpectedForCollector(actor.organizationId, collectorId, generatorId);
    return this.prisma.collectionSession.create({
      data: {
        organizationId: actor.organizationId,
        collectorId,
        generatorId,
        sessionDate,
        openingBalance: '0',
        expectedAmount: expected.toFixed(),
        collectedAmount: '0',
        status: 'OPEN',
      },
    });
  }

  async recordPayment(actor: AuthUser, dto: CollectorPaymentDto, meta: RequestMeta, idempotencyKey?: string) {
    const collector = await this.resolveCollector(actor.organizationId, actor.userId);
    if (!collector) throw new AppException(ErrorCodes.FORBIDDEN, 'يجب أن يكون لديك ملف جابٍ لتسجيل الدفعات', 403);

    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!customer) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المشترك غير موجود', 404);

    // الجابي يرى فقط مشتركيه المعينين — فرض خلفي (§10/§112)
    const assignment = await this.prisma.collectorAssignment.findFirst({
      where: { collectorId: collector.id, customerId: customer.id, status: 'ACTIVE' },
    });
    if (!assignment) throw new AppException(ErrorCodes.FORBIDDEN, 'هذا المشترك غير معين لهذا الجابي', 403);

    await this.scope.assertGeneratorAccess(actor.organizationId, actor, customer.generatorId);

    const session = await this.findOrCreateSession(actor, collector.id, customer.generatorId);

    // المعاملة المالية الذرية (دفعة + تحديث فواتير + وصل + تدقيق) داخل PaymentsService (§88)
    const result = await this.payments.create(actor, dto, meta, idempotencyKey);

    if (!result.deduplicated) {
      // خطوة دفترية بعد الالتزام المالي: ربط الدفعة بالجلسة وتحديث المحصّل.
      // المحصّل قابل لإعادة الاحتساب من الدفعات، فلا خطر على سلامة المال (§204).
      const amount = new Decimal(dto.amount);
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: result.payment.id }, data: { sessionId: session.id } });
        await tx.collectionSession.update({ where: { id: session.id }, data: { collectedAmount: { increment: amount } } });
      });
    }

    return { ...result, sessionId: session.id };
  }

  // ============================================================
  // جلسات المطابقة (§29/§144)
  // ============================================================
  async listSessions(orgId: string, user: AuthUser, query: ListSessionsQuery) {
    if (query.generatorId) await this.scope.assertGeneratorAccess(orgId, user, query.generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(orgId, user);

    const where: Prisma.CollectionSessionWhereInput = {
      organizationId: orgId,
      ...(allowed && !query.generatorId ? { generatorId: { in: allowed } } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...(query.collectorId ? { collectorId: query.collectorId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.collectionSession.findMany({
        where,
        include: { collector: { select: { id: true, name: true } }, generator: { select: { id: true, name: true } } },
        orderBy: { sessionDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.collectionSession.count({ where }),
    ]);
    return { items, meta: { page, pageSize, total } };
  }

  async openSession(actor: AuthUser, dto: OpenSessionDto, meta: RequestMeta) {
    const collector = await this.resolveCollector(actor.organizationId, actor.userId);
    if (!collector) throw new AppException(ErrorCodes.FORBIDDEN, 'يجب أن يكون لديك ملف جابٍ لفتح جلسة', 403);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);

    const sessionDate = dto.sessionDate ? new Date(dto.sessionDate) : startOfTodayUTC();
    const existing = await this.prisma.collectionSession.findUnique({
      where: { collectorId_generatorId_sessionDate: { collectorId: collector.id, generatorId: dto.generatorId, sessionDate } },
    });
    if (existing) return existing; // فتح idempotent

    const expected = await this.computeExpectedForCollector(actor.organizationId, collector.id, dto.generatorId);

    return this.prisma.$transaction(async (tx) => {
      const session = await tx.collectionSession.create({
        data: {
          organizationId: actor.organizationId,
          collectorId: collector.id,
          generatorId: dto.generatorId,
          sessionDate,
          openingBalance: dto.openingBalance ?? '0',
          expectedAmount: expected.toFixed(),
          collectedAmount: '0',
          status: 'OPEN',
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'collection.session_open', entityType: 'CollectionSession', entityId: session.id,
        after: { generatorId: dto.generatorId, expectedAmount: expected.toFixed() },
        metadata: { generatorId: dto.generatorId }, meta,
      });
      return session;
    });
  }

  private async loadSession(orgId: string, id: string) {
    const session = await this.prisma.collectionSession.findFirst({
      where: { id, organizationId: orgId },
      include: { collector: { select: { id: true, name: true } }, generator: { select: { id: true, name: true } } },
    });
    if (!session) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الجلسة غير موجودة', 404);
    return session;
  }

  /** التسليم (§144): الجابي صاحب الجلسة يقدم النقد الفعلي، ويُحتسب الفرق صراحةً (§29) */
  async submitSession(actor: AuthUser, id: string, dto: SubmitSessionDto, meta: RequestMeta) {
    const session = await this.loadSession(actor.organizationId, id);
    const collector = await this.resolveCollector(actor.organizationId, actor.userId);
    if (!collector || collector.id !== session.collectorId) {
      throw new AppException(ErrorCodes.FORBIDDEN, 'فقط الجابي صاحب الجلسة يمكنه تسليمها', 403);
    }
    if (session.status !== 'OPEN') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'الجلسة ليست مفتوحة', 422);
    }

    const cash = new Decimal(dto.cashSubmitted);
    const collected = new Decimal(session.collectedAmount.toString());
    // الفرق = المحصّل المسجل − النقد المقدم. موجب = عجز نقد، سالب = زيادة.
    const difference = collected.sub(cash);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.collectionSession.update({
        where: { id },
        data: {
          cashSubmitted: cash.toFixed(),
          difference: difference.toFixed(),
          status: 'SUBMITTED',
          closedAt: new Date(),
          closedBy: actor.userId,
          notes: dto.notes,
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'collection.session_submit', entityType: 'CollectionSession', entityId: id,
        after: { cashSubmitted: cash.toFixed(), difference: difference.toFixed() },
        metadata: { generatorId: session.generatorId }, meta,
      });
      return updated;
    });
  }

  /** المطابقة (§144): المدير يطابق أو ينازع */
  async reconcileSession(actor: AuthUser, id: string, dto: ReconcileSessionDto, meta: RequestMeta) {
    const session = await this.loadSession(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, session.generatorId);
    if (session.status !== 'SUBMITTED' && session.status !== 'DISPUTED') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'الجلسة يجب أن تكون مُسلّمة للمطابقة', 422);
    }
    const newStatus = dto.outcome === 'RECONCILED' ? 'RECONCILED' : 'DISPUTED';

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.collectionSession.update({
        where: { id },
        data: { status: newStatus, notes: dto.notes },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: newStatus === 'RECONCILED' ? 'collection.session_reconciled' : 'collection.session_disputed',
        entityType: 'CollectionSession', entityId: id,
        after: { status: newStatus },
        metadata: { generatorId: session.generatorId, difference: session.difference?.toString() ?? null }, meta,
      });
      return updated;
    });
  }

  /** الاعتماد (§144): خطوة نهائية بعد المطابقة */
  async approveSession(actor: AuthUser, id: string, meta: RequestMeta) {
    const session = await this.loadSession(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, session.generatorId);
    if (session.status !== 'RECONCILED') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'الجلسة يجب أن تكون مُطابقة قبل الاعتماد', 422);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.collectionSession.update({
        where: { id },
        data: { status: 'APPROVED', approvedBy: actor.userId },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'collection.session_approved', entityType: 'CollectionSession', entityId: id,
        after: { status: 'APPROVED' },
        metadata: { generatorId: session.generatorId }, meta,
      });
      return updated;
    });
  }

  // ============================================================
  // إدارة الجباة (§23)
  // ============================================================
  async listCollectors(orgId: string) {
    return this.prisma.collector.findMany({
      where: { organizationId: orgId },
      include: { user: { select: { id: true, name: true, phone: true } }, _count: { select: { assignments: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCollector(actor: AuthUser, dto: CreateCollectorDto, meta: RequestMeta) {
    if (dto.userId) {
      const user = await this.prisma.user.findFirst({ where: { id: dto.userId, organizationId: actor.organizationId } });
      if (!user) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المستخدم غير موجود في المنظمة', 404);
      const existing = await this.prisma.collector.findFirst({ where: { userId: dto.userId } });
      if (existing) throw new AppException(ErrorCodes.DUPLICATE_RESOURCE, 'المستخدم مرتبط بملف جابٍ بالفعل', 409);
    }
    return this.prisma.$transaction(async (tx) => {
      const collector = await tx.collector.create({
        data: {
          organizationId: actor.organizationId,
          userId: dto.userId ?? null,
          name: dto.name,
          phone: dto.phone,
          employeeCode: dto.employeeCode,
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'collector.create', entityType: 'Collector', entityId: collector.id,
        after: { name: collector.name }, meta,
      });
      return collector;
    });
  }

  async updateCollector(actor: AuthUser, id: string, dto: UpdateCollectorDto, meta: RequestMeta) {
    const collector = await this.prisma.collector.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!collector) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الجابي غير موجود', 404);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.collector.update({ where: { id }, data: { ...dto } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'collector.update', entityType: 'Collector', entityId: id,
        before: collector, after: updated, meta,
      });
      return updated;
    });
  }

  // ============================================================
  // التعيينات (§24)
  // ============================================================
  async listAssignments(orgId: string, collectorId?: string) {
    return this.prisma.collectorAssignment.findMany({
      where: { organizationId: orgId, ...(collectorId ? { collectorId } : {}) },
      include: {
        collector: { select: { id: true, name: true } },
        customer: { select: { id: true, fullName: true, customerNumber: true } },
        generator: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async createAssignment(actor: AuthUser, dto: CreateAssignmentDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    const collector = await this.prisma.collector.findFirst({ where: { id: dto.collectorId, organizationId: actor.organizationId } });
    if (!collector) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الجابي غير موجود', 404);
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!customer) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المشترك غير موجود', 404);
    if (customer.generatorId !== dto.generatorId) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'المشترك لا يتبع هذه المولدة', 422);
    }

    return this.prisma.$transaction(async (tx) => {
      // إنهاء أي تعيين نشط سابق لنفس المشترك+المولدة لمنع الغموض (§114 مبدأ عدم التطبيق الغامض)
      await tx.collectorAssignment.updateMany({
        where: { customerId: dto.customerId, generatorId: dto.generatorId, status: 'ACTIVE' },
        data: { status: 'ENDED', assignedTo: new Date() },
      });
      const assignment = await tx.collectorAssignment.create({
        data: {
          organizationId: actor.organizationId,
          collectorId: dto.collectorId,
          generatorId: dto.generatorId,
          customerId: dto.customerId,
        },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'collection.assign', entityType: 'CollectorAssignment', entityId: assignment.id,
        after: { collectorId: dto.collectorId, customerId: dto.customerId },
        metadata: { generatorId: dto.generatorId }, meta,
      });
      return assignment;
    });
  }

  async endAssignment(actor: AuthUser, id: string, meta: RequestMeta) {
    const assignment = await this.prisma.collectorAssignment.findFirst({ where: { id, organizationId: actor.organizationId } });
    if (!assignment) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'التعيين غير موجود', 404);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.collectorAssignment.update({
        where: { id },
        data: { status: 'ENDED', assignedTo: new Date() },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'collection.unassign', entityType: 'CollectorAssignment', entityId: id,
        metadata: { generatorId: assignment.generatorId, customerId: assignment.customerId }, meta,
      });
      return updated;
    });
  }
}
