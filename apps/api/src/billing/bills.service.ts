import { Injectable } from '@nestjs/common';
import { Decimal, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { addDays, parseDay } from '../common/dates';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { BillingConfigService } from './billing-config.service';
import { calculateBill } from './billing.engine';
import type { BillingCalculation, BillingConfig } from './billing.engine';
import { AdjustBillDto, GenerateBillsDto, ListBillsQuery } from './dto';

const COLLECTABLE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const;
const ADJUSTABLE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const;

interface PreviewRow {
  subscriptionId: string;
  customerId: string;
  customerNumber: string;
  customerName: string;
  calc: BillingCalculation;
  snapshot: Prisma.InputJsonValue;
}

interface PreviewError {
  customerId: string;
  customerName: string;
  error: string;
}

@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
    private readonly billingConfig: BillingConfigService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(orgId: string, user: AuthUser, query: ListBillsQuery) {
    if (query.generatorId) await this.scope.assertGeneratorAccess(orgId, user, query.generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(orgId, user);

    const where: Prisma.BillWhereInput = {
      organizationId: orgId,
      ...(allowed ? { generatorId: { in: allowed } } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { billNumber: { contains: query.q } } : {}),
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.bill.findMany({
        where,
        include: {
          customer: { select: { id: true, fullName: true, customerNumber: true } },
          generator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.bill.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total } };
  }

  private async loadOwned(orgId: string, id: string) {
    const bill = await this.prisma.bill.findFirst({
      where: { id, organizationId: orgId },
      include: {
        customer: { select: { id: true, fullName: true, customerNumber: true, phonePrimary: true } },
        generator: { select: { id: true, name: true } },
        adjustments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!bill) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الفاتورة غير موجودة', 404);
    return bill;
  }

  async get(orgId: string, user: AuthUser, id: string) {
    const bill = await this.loadOwned(orgId, id);
    await this.scope.assertGeneratorAccess(orgId, user, bill.generatorId);
    return bill;
  }

  private async customerOutstanding(orgId: string, customerId: string): Promise<string> {
    const agg = await this.prisma.bill.aggregate({
      where: { organizationId: orgId, customerId, status: { in: [...COLLECTABLE_STATUSES] } },
      _sum: { outstandingAmount: true },
    });
    return (agg._sum.outstandingAmount ?? new Decimal(0)).toFixed();
  }

  /**
   * اختيار نسخة السعر السارية للفترة (§15):
   * أحدث نسخة من نفس الخطة (الاسم + الأمبير) كانت سارية في بداية الفترة.
   * يضمن أن الفواتير التاريخية تستخدم السعر التاريخي الصحيح.
   */
  private async resolvePlanForPeriod(subscriptionPlanId: string, periodStart: Date) {
    const current = await this.prisma.amperePlan.findUnique({ where: { id: subscriptionPlanId } });
    if (!current) return null;
    const lineage = await this.prisma.amperePlan.findMany({
      where: {
        generatorId: current.generatorId,
        organizationId: current.organizationId,
        name: current.name,
        ampereAmount: current.ampereAmount,
      },
    });
    return (
      lineage.find((p) => p.effectiveFrom <= periodStart && (p.effectiveTo === null || p.effectiveTo > periodStart)) ??
      null
    );
  }

  private async computePreview(orgId: string, generatorId: string, periodStart: Date, periodEnd: Date, config: BillingConfig) {
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        organizationId: orgId,
        generatorId,
        OR: [
          { status: 'ACTIVE' },
          { status: 'PENDING', startDate: { lte: periodEnd } },
          // اشتراكات أُلغيت أثناء الفترة → فوترة جزئية (§113)
          { status: 'CANCELLED', endDate: { gte: periodStart, lte: periodEnd } },
        ],
      },
      include: { customer: { select: { id: true, fullName: true, customerNumber: true, status: true } } },
    });

    const items: PreviewRow[] = [];
    const errors: PreviewError[] = [];

    for (const sub of subscriptions) {
      if (sub.customer.status !== 'ACTIVE') {
        errors.push({ customerId: sub.customer.id, customerName: sub.customer.fullName, error: 'المشترك غير نشط' });
        continue;
      }
      const plan = await this.resolvePlanForPeriod(sub.amperePlanId, periodStart);
      if (!plan) {
        errors.push({ customerId: sub.customer.id, customerName: sub.customer.fullName, error: 'لا توجد خطة سعرية سارية في بداية الفترة' });
        continue;
      }
      const previousDebt = await this.customerOutstanding(orgId, sub.customerId);
      const calc = calculateBill({
        subscription: {
          customPrice: sub.customPrice?.toString() ?? null,
          customAmpere: sub.customAmpere?.toString() ?? null,
          discountType: sub.discountType,
          discountValue: sub.discountValue?.toString() ?? null,
          startDate: sub.startDate,
          endDate: sub.endDate,
        },
        plan: { price: plan.price.toString(), ampereAmount: plan.ampereAmount.toString() },
        periodStart,
        periodEnd,
        previousDebt,
        config,
      });
      const snapshot = {
        version: 1,
        subscriptionId: sub.id,
        planId: plan.id,
        planName: plan.name,
        planPrice: plan.price.toString(),
        planAmpere: plan.ampereAmount.toString(),
        customPrice: sub.customPrice?.toString() ?? null,
        previousDebt,
        config,
        calculation: calc,
      };
      items.push({
        subscriptionId: sub.id,
        customerId: sub.customer.id,
        customerNumber: sub.customer.customerNumber,
        customerName: sub.customer.fullName,
        calc,
        snapshot: snapshot as Prisma.InputJsonValue,
      });
    }

    const totals = items.reduce(
      (acc, row) => {
        acc.count += 1;
        acc.totalAmount = acc.totalAmount.add(row.calc.totalAmount);
        acc.totalDiscount = acc.totalDiscount.add(row.calc.discountAmount);
        acc.totalPenalty = acc.totalPenalty.add(row.calc.penaltyAmount);
        acc.totalPreviousDebt = acc.totalPreviousDebt.add(row.calc.previousDebt);
        return acc;
      },
      { count: 0, totalAmount: new Decimal(0), totalDiscount: new Decimal(0), totalPenalty: new Decimal(0), totalPreviousDebt: new Decimal(0) },
    );

    return {
      items,
      errors,
      totals: {
        count: totals.count,
        totalAmount: totals.totalAmount.toFixed(),
        totalDiscount: totals.totalDiscount.toFixed(),
        totalPenalty: totals.totalPenalty.toFixed(),
        totalPreviousDebt: totals.totalPreviousDebt.toFixed(),
      },
    };
  }

  async preview(actor: AuthUser, dto: GenerateBillsDto) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    const periodStart = parseDay(dto.periodStart);
    const periodEnd = parseDay(dto.periodEnd);
    if (periodEnd.getTime() <= periodStart.getTime()) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'نهاية الفترة يجب أن تكون بعد بدايتها', 422);
    }
    const config = await this.billingConfig.get(actor.organizationId);
    return this.computePreview(actor.organizationId, dto.generatorId, periodStart, periodEnd, config);
  }

  private async nextBillNumber(tx: Prisma.TransactionClient, orgId: string, year: number): Promise<string> {
    const seq = await tx.documentSequence.upsert({
      where: { organizationId_kind_year: { organizationId: orgId, kind: 'BILL', year } },
      update: { lastValue: { increment: 1 } },
      create: { organizationId: orgId, kind: 'BILL', year, lastValue: 1 },
    });
    return `B-${year}-${String(seq.lastValue).padStart(6, '0')}`;
  }

  /** توليد idempotent (§181): نفس المولدة + الفترة تعيد نفس السجل دون تكرار الفواتير (§141) */
  async generate(actor: AuthUser, dto: GenerateBillsDto, meta: RequestMeta) {
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, dto.generatorId);
    const periodStart = parseDay(dto.periodStart);
    const periodEnd = parseDay(dto.periodEnd);
    if (periodEnd.getTime() <= periodStart.getTime()) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'نهاية الفترة يجب أن تكون بعد بدايتها', 422);
    }

    const existingRun = await this.prisma.billingRun.findUnique({
      where: { generatorId_periodStart_periodEnd: { generatorId: dto.generatorId, periodStart, periodEnd } },
    });
    if (existingRun && existingRun.status !== 'RUNNING' && existingRun.status !== 'PENDING') {
      return this.runResult(existingRun);
    }

    const config = await this.billingConfig.get(actor.organizationId);
    const preview = await this.computePreview(actor.organizationId, dto.generatorId, periodStart, periodEnd, config);

    if (preview.items.length === 0) {
      throw new AppException(ErrorCodes.INVALID_STATE, 'لا توجد اشتراكات صالحة للفوترة في هذه الفترة', 422);
    }
    const MAX_BILLS_PER_RUN = 500;
    if (preview.items.length > MAX_BILLS_PER_RUN) {
      throw new AppException(
        ErrorCodes.VALIDATION_ERROR,
        `عدد الاشتراكات (${preview.items.length}) يتجاوز حد التوليد المتزامن ${MAX_BILLS_PER_RUN}`,
        422,
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const run = await tx.billingRun.create({
          data: {
            organizationId: actor.organizationId,
            generatorId: dto.generatorId,
            periodStart,
            periodEnd,
            status: 'RUNNING',
            idempotencyKey: dto.idempotencyKey ?? `auto:${dto.generatorId}:${dto.periodStart}:${dto.periodEnd}`,
            initiatedBy: actor.userId,
            startedAt: new Date(),
            totalBills: preview.items.length,
          },
        });

        const year = periodStart.getUTCFullYear();
        let created = 0;
        let totalAmount = new Decimal(0);

        for (const row of preview.items) {
          const billNumber = await this.nextBillNumber(tx, actor.organizationId, year);
          await tx.bill.create({
            data: {
              organizationId: actor.organizationId,
              generatorId: dto.generatorId,
              customerId: row.customerId,
              subscriptionId: row.subscriptionId,
              billNumber,
              billingPeriodStart: periodStart,
              billingPeriodEnd: periodEnd,
              issueDate: new Date(),
              dueDate: addDays(periodEnd, config.gracePeriodDays),
              currency: 'IQD',
              subtotal: row.calc.baseCharge,
              discountAmount: row.calc.discountAmount,
              penaltyAmount: row.calc.penaltyAmount,
              previousDebt: row.calc.previousDebt,
              creditApplied: row.calc.creditApplied,
              totalAmount: row.calc.totalAmount,
              paidAmount: '0',
              outstandingAmount: row.calc.totalAmount,
              status: 'DRAFT',
              calculationSnapshot: row.snapshot,
              createdBy: actor.userId,
            },
          });
          created += 1;
          totalAmount = totalAmount.add(row.calc.totalAmount);
        }

        const completed = await tx.billingRun.update({
          where: { id: run.id },
          data: {
            status: preview.errors.length > 0 ? 'PARTIALLY_FAILED' : 'COMPLETED',
            createdBills: created,
            failedBills: preview.errors.length,
            totalAmount: totalAmount.toFixed(),
            completedAt: new Date(),
          },
        });

        await this.audit.log({
          tx, organizationId: actor.organizationId, actorUserId: actor.userId,
          action: 'billing.generate', entityType: 'BillingRun', entityId: run.id,
          after: { createdBills: created, failedBills: preview.errors.length, totalAmount: totalAmount.toFixed() },
          metadata: { generatorId: dto.generatorId, periodStart: dto.periodStart, periodEnd: dto.periodEnd },
          meta,
        });

        return this.runResult(completed, preview.errors);
      });
    } catch (e) {
      // سباق على نفس الفترة: القيد الفريد هو خط الدفاع الأخير (§89)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const run = await this.prisma.billingRun.findUnique({
          where: { generatorId_periodStart_periodEnd: { generatorId: dto.generatorId, periodStart, periodEnd } },
        });
        if (run) return this.runResult(run);
      }
      throw e;
    }
  }

  private runResult(run: { id: string; status: string; totalBills: number; createdBills: number; failedBills: number; totalAmount: unknown }, errors?: PreviewError[]) {
    return {
      runId: run.id,
      status: run.status,
      totalBills: run.totalBills,
      createdBills: run.createdBills,
      failedBills: run.failedBills,
      totalAmount: run.totalAmount.toString(),
      errors: errors ?? [],
    };
  }

  /** قائمة دفعات إصدار الفواتير (billing runs) ضمن نطاق المولدات المسموح (§89) */
  async listRuns(actor: AuthUser) {
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    const runs = await this.prisma.billingRun.findMany({
      where: {
        organizationId: actor.organizationId,
        ...(allowed ? { generatorId: { in: allowed } } : {}),
      },
      include: { generator: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return runs.map((run) => ({ ...run, totalAmount: run.totalAmount.toString() }));
  }

  async issue(actor: AuthUser, id: string, meta: RequestMeta) {
    const bill = await this.loadOwned(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, bill.generatorId);
    if (bill.status !== 'DRAFT') {
      throw new AppException(ErrorCodes.BILL_ALREADY_ISSUED, 'الفاتورة ليست مسودة — لا يمكن إصدارها مجدداً', 422);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bill.update({ where: { id }, data: { status: 'ISSUED', issueDate: new Date() } });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'bill.issue', entityType: 'Bill', entityId: id,
        before: { status: bill.status }, after: { status: 'ISSUED' },
        metadata: { generatorId: bill.generatorId, customerId: bill.customerId, totalAmount: bill.totalAmount.toString() },
        meta,
      });
    });

    // الإشعار بعد الالتزام — فشله لا يمس الفاتورة (§190/§77)
    try {
      await this.notifications.notifyBillIssued(
        actor.organizationId, bill.customerId, bill.id, bill.billNumber,
        bill.totalAmount.toString(), bill.dueDate,
      );
    } catch { /* لا انعكاس على الفاتورة */ }

    return this.loadOwned(actor.organizationId, id);
  }

  async issueBulk(actor: AuthUser, runId: string, meta: RequestMeta) {
    const run = await this.prisma.billingRun.findFirst({ where: { id: runId, organizationId: actor.organizationId } });
    if (!run) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'سجل التوليد غير موجود', 404);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, run.generatorId);

    const result = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.bill.updateMany({
        where: {
          organizationId: actor.organizationId,
          generatorId: run.generatorId,
          billingPeriodStart: run.periodStart,
          billingPeriodEnd: run.periodEnd,
          status: 'DRAFT',
        },
        data: { status: 'ISSUED', issueDate: new Date() },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'bill.issue_bulk', entityType: 'BillingRun', entityId: runId,
        after: { issuedCount: updateResult.count },
        metadata: { generatorId: run.generatorId }, meta,
      });
      return updateResult;
    });

    return { issued: result.count };
  }

  async adjust(actor: AuthUser, id: string, dto: AdjustBillDto, meta: RequestMeta) {
    const bill = await this.loadOwned(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, bill.generatorId);

    if (!ADJUSTABLE_STATUSES.includes(bill.status as typeof ADJUSTABLE_STATUSES[number])) {
      throw new AppException(ErrorCodes.INVALID_STATE, 'لا يمكن تعديل فاتورة غير صادرة', 422);
    }
    if (dto.type === 'CORRECTION' && !dto.direction) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'تحديد الاتجاه (INCREASE/DECREASE) إلزامي للتعديل التصحيحي', 422);
    }

    const config = await this.billingConfig.get(actor.organizationId);
    const needsApproval = new Decimal(dto.amount).greaterThan(new Decimal(config.adjustmentApprovalThreshold));

    return this.prisma.$transaction(async (tx) => {
      const adjustment = await tx.billAdjustment.create({
        data: {
          organizationId: actor.organizationId,
          billId: id,
          type: dto.type as 'DISCOUNT' | 'PENALTY' | 'CREDIT' | 'DEBIT' | 'CORRECTION' | 'REFUND',
          amount: dto.amount,
          reason: dto.reason,
          status: needsApproval ? 'PENDING' : 'APPROVED',
          createdBy: actor.userId,
          approvedBy: needsApproval ? null : actor.userId,
        },
      });

      if (!needsApproval) {
        await this.applyAdjustment(tx, bill, dto.type, dto.amount, dto.direction);
      }

      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'bill.adjust', entityType: 'Bill', entityId: id,
        after: { type: dto.type, amount: dto.amount, status: needsApproval ? 'PENDING' : 'APPROVED' },
        metadata: { generatorId: bill.generatorId, customerId: bill.customerId, reason: dto.reason, needsApproval },
        meta,
      });

      return { adjustment, applied: !needsApproval, needsApproval };
    });
  }

  async approveAdjustment(actor: AuthUser, adjustmentId: string, meta: RequestMeta) {
    const adjustment = await this.prisma.billAdjustment.findFirst({
      where: { id: adjustmentId, organizationId: actor.organizationId },
      include: { bill: true },
    });
    if (!adjustment) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'التعديل غير موجود', 404);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, adjustment.bill.generatorId);
    if (adjustment.status !== 'PENDING') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'التعديل ليس بانتظار الموافقة', 422);
    }

    return this.prisma.$transaction(async (tx) => {
      await this.applyAdjustment(tx, adjustment.bill, adjustment.type, adjustment.amount.toString(), undefined);
      const approved = await tx.billAdjustment.update({
        where: { id: adjustmentId },
        data: { status: 'APPROVED', approvedBy: actor.userId },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'bill.adjustment_approved', entityType: 'BillAdjustment', entityId: adjustmentId,
        metadata: { billId: adjustment.billId, type: adjustment.type, amount: adjustment.amount.toString() },
        meta,
      });
      return approved;
    });
  }

  /**
   * تطبيق التعديل (§139): الخصم/الائتمان/الاسترداد تخفض المستحق؛ الغرامة/المدين ترفعه.
   * إذا صفّر التعديل المستحق تُعلَّم الفاتورة PAID (لا شيء متبقٍ).
   */
  private async applyAdjustment(
    tx: Prisma.TransactionClient,
    bill: { id: string; totalAmount: unknown; outstandingAmount: unknown; discountAmount: unknown; penaltyAmount: unknown; creditApplied: unknown },
    type: string,
    amount: string,
    direction?: string,
  ) {
    const amt = new Decimal(amount);
    let total = new Decimal(bill.totalAmount.toString());
    let outstanding = new Decimal(bill.outstandingAmount.toString());
    const data: Prisma.BillUpdateInput = {};

    const increase = () => {
      total = total.add(amt);
      outstanding = outstanding.add(amt);
    };
    const decrease = () => {
      outstanding = outstanding.sub(amt);
      if (outstanding.lessThan(0)) outstanding = new Decimal(0);
    };

    switch (type) {
      case 'DISCOUNT':
        decrease();
        data.discountAmount = new Decimal(bill.discountAmount.toString()).add(amt).toFixed();
        break;
      case 'CREDIT':
        decrease();
        data.creditApplied = new Decimal(bill.creditApplied.toString()).add(amt).toFixed();
        break;
      case 'REFUND':
        decrease();
        break;
      case 'PENALTY':
        increase();
        data.penaltyAmount = new Decimal(bill.penaltyAmount.toString()).add(amt).toFixed();
        break;
      case 'DEBIT':
        increase();
        break;
      case 'CORRECTION':
        if (direction === 'INCREASE') increase();
        else decrease();
        break;
    }

    data.totalAmount = total.toFixed();
    data.outstandingAmount = outstanding.toFixed();
    if (outstanding.isZero()) data.status = 'PAID';

    await tx.bill.update({ where: { id: bill.id }, data });
  }

  /** الإبطال (§138): يتطلب سببًا، ولا يجوز مع وجود دفعات (§113-9) */
  async void(actor: AuthUser, id: string, reason: string, meta: RequestMeta) {
    const bill = await this.loadOwned(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, bill.generatorId);

    if (bill.status === 'VOID') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'الفاتورة مبطلة بالفعل', 422);
    }
    if (new Decimal(bill.paidAmount.toString()).greaterThan(0)) {
      throw new AppException(
        ErrorCodes.INVALID_STATE,
        'لا يمكن إبطال فاتورة عليها دفعات مسجلة — اعكس الدفعات أولاً ثم أبطل',
        422,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const voided = await tx.bill.update({
        where: { id },
        data: { status: 'VOID', voidedAt: new Date(), voidedBy: actor.userId, voidReason: reason },
      });
      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'bill.void', entityType: 'Bill', entityId: id,
        before: { status: bill.status }, after: { status: 'VOID' },
        metadata: { generatorId: bill.generatorId, customerId: bill.customerId, reason },
        meta,
      });
      return voided;
    });
  }

  /** كشف المتأخرات: حتمي وقابل للتشغيل مرتين دون تكرار (§92) */
  async sweepOverdue(orgId: string, actorUserId: string | null, meta?: RequestMeta): Promise<number> {
    const today = new Date();
    const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    const candidates = await this.prisma.bill.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        dueDate: { lt: utcToday },
        outstandingAmount: { gt: 0 },
      },
      select: { id: true, customerId: true, billNumber: true, outstandingAmount: true },
    });
    if (candidates.length === 0) return 0;

    const result = await this.prisma.bill.updateMany({
      where: { id: { in: candidates.map((c) => c.id) } },
      data: { status: 'OVERDUE' },
    });

    for (const bill of candidates) {
      try {
        await this.notifications.notifyOverdue(orgId, bill.customerId, bill.id, bill.billNumber, bill.outstandingAmount.toString());
      } catch { /* فشل الإشعار لا يوقف الكشف (§77) */ }
    }

    await this.audit.log({
      organizationId: orgId, actorUserId,
      action: 'billing.overdue_sweep', entityType: 'Bill',
      after: { markedOverdue: result.count },
      metadata: { source: meta ? 'manual' : 'cron' },
      meta,
    });
    return result.count;
  }

  async history(orgId: string, user: AuthUser, id: string) {
    await this.get(orgId, user, id);
    return this.prisma.auditLog.findMany({
      where: { organizationId: orgId, entityType: 'Bill', entityId: id },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
