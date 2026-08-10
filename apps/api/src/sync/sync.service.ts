import { Injectable } from '@nestjs/common';
import { Decimal, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import type { AuthUser, RequestMeta } from '../common/types';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ResolveConflictDto, SyncPushDto, SyncPushTransactionDto, SyncStatusQuery } from './dto';

const PAYABLE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const;

/**
 * أكواد تشير إلى صراع حقيقي بين معاملة الأوفلاين وحالة الخادم (§27):
 * المال لا يُحسم تلقائيًا بـ "آخر كتابة تفوز" بل يدخل CONFLICT ويتطلب قرارًا بشريًا.
 */
const CONFLICT_CODES = new Set<string>([
  ErrorCodes.INVALID_STATE,
  ErrorCodes.FORBIDDEN,
  ErrorCodes.RESOURCE_NOT_FOUND,
  ErrorCodes.DUPLICATE_PAYMENT,
  ErrorCodes.BILL_ALREADY_ISSUED,
  ErrorCodes.TENANT_ACCESS_DENIED,
]);

interface OfflinePaymentPayload {
  customerId?: string;
  billId?: string;
  amount?: string;
  paymentMethod?: string;
  paymentDate?: string;
  notes?: string;
}

function startOfTodayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
  ) {}

  private async resolveCollector(orgId: string, userId: string) {
    return this.prisma.collector.findFirst({ where: { organizationId: orgId, userId } });
  }

  // ============ PUSH — idempotent (§21/§26) ============
  async push(actor: AuthUser, dto: SyncPushDto, meta: RequestMeta) {
    const collector = await this.resolveCollector(actor.organizationId, actor.userId);
    if (!collector) {
      throw new AppException(ErrorCodes.FORBIDDEN, 'يجب أن يكون لديك ملف جابٍ للمزامنة', 403);
    }
    const results = [];
    for (const tx of dto.transactions) {
      results.push(await this.processTransaction(actor, collector.id, dto.deviceId, tx, meta));
    }
    await this.audit.log({
      organizationId: actor.organizationId,
      actorUserId: actor.userId,
      action: 'sync.push',
      entityType: 'SyncTransaction',
      after: { deviceId: dto.deviceId, count: dto.transactions.length },
      metadata: { deviceId: dto.deviceId },
      meta,
    });
    return { results };
  }

  private async processTransaction(actor: AuthUser, collectorId: string, deviceId: string, tx: SyncPushTransactionDto, meta: RequestMeta) {
    // Idempotency: معاملة بنفس clientTransactionId عولجت سابقًا → أعد حالتها دون إعادة معالجة (§26)
    const existing = await this.prisma.syncTransaction.findUnique({
      where: {
        organizationId_clientTransactionId: {
          organizationId: actor.organizationId,
          clientTransactionId: tx.clientTransactionId,
        },
      },
    });
    if (existing && existing.status === 'SYNCED') {
      return { clientTransactionId: tx.clientTransactionId, status: 'SYNCED', serverEntityId: existing.serverEntityId };
    }
    if (existing && existing.status === 'CONFLICT') {
      return { clientTransactionId: tx.clientTransactionId, status: 'CONFLICT', error: existing.error };
    }

    try {
      let result: { serverEntityId: string; receiptNumber?: string };
      if (tx.entityType === 'PAYMENT') {
        result = await this.applyPaymentTransaction(actor, collectorId, tx.payload as OfflinePaymentPayload, meta, tx.clientTransactionId, tx.createdOfflineAt);
      } else {
        throw new AppException(ErrorCodes.VALIDATION_ERROR, `نوع معاملة غير مدعوم للمزامنة: ${tx.entityType}`, 422);
      }
      await this.upsertSyncTransaction(actor, deviceId, tx, 'SYNCED', result.serverEntityId, null);
      return { clientTransactionId: tx.clientTransactionId, status: 'SYNCED', serverEntityId: result.serverEntityId, receiptNumber: result.receiptNumber };
    } catch (e) {
      // سباق على قيد تفرد الدفعة (جامعان/إعادة إرسال متزامنة) → اعتباره نجاحًا مكررًا بدل فشل (§89)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existingPayment = await this.prisma.payment.findUnique({
          where: {
            organizationId_offlineTransactionId: {
              organizationId: actor.organizationId,
              offlineTransactionId: tx.clientTransactionId,
            },
          },
        });
        if (existingPayment) {
          await this.upsertSyncTransaction(actor, deviceId, tx, 'SYNCED', existingPayment.id, null);
          return { clientTransactionId: tx.clientTransactionId, status: 'SYNCED', serverEntityId: existingPayment.id };
        }
      }
      const isConflict = e instanceof AppException && CONFLICT_CODES.has(e.code as string);
      const status = isConflict ? 'CONFLICT' : 'FAILED';
      const errorMsg = e instanceof Error ? e.message : 'خطأ غير معروف أثناء المزامنة';
      await this.upsertSyncTransaction(actor, deviceId, tx, status, null, errorMsg);
      return { clientTransactionId: tx.clientTransactionId, status, error: errorMsg };
    }
  }

  private async applyPaymentTransaction(
    actor: AuthUser,
    collectorId: string,
    payload: OfflinePaymentPayload,
    meta: RequestMeta,
    clientTransactionId: string,
    createdOfflineAt: string,
  ): Promise<{ serverEntityId: string; receiptNumber?: string }> {
    if (!payload.customerId || !payload.amount) {
      throw new AppException(ErrorCodes.VALIDATION_ERROR, 'حمولة الدفعة غير مكتملة (customerId و amount مطلوبان)', 422);
    }
    const customer = await this.prisma.customer.findFirst({
      where: { id: payload.customerId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!customer) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المشترك غير موجود أو مؤرشف', 404);

    // تخويل الجابي قائم على التعيين لا على نطاق المولدة (§12/§27):
    // المشترك يجب أن يكون معينًا نشطًا لهذا الجابي وإلا فهي صراع يتطلب قرارًا.
    const assignment = await this.prisma.collectorAssignment.findFirst({
      where: { collectorId, customerId: customer.id, status: 'ACTIVE' },
    });
    if (!assignment) throw new AppException(ErrorCodes.FORBIDDEN, 'المشترك غير معين لهذا الجابي', 403);

    const result = await this.payments.create(
      actor,
      {
        customerId: payload.customerId,
        billId: payload.billId,
        amount: payload.amount,
        paymentMethod: payload.paymentMethod ?? 'CASH',
        paymentDate: payload.paymentDate ?? createdOfflineAt,
        offlineTransactionId: clientTransactionId,
        notes: payload.notes,
      },
      meta,
      clientTransactionId,
    );

    // اربط الدفعة بجلسة الجابي الحالية لدعم المطابقة (§29).
    // منطق مُكرر محليًا عمدًا لتجنب تبع دائري بين الوحدات (§41).
    await this.linkToSession(actor, collectorId, customer.generatorId, result.payment.id, new Decimal(payload.amount));

    return { serverEntityId: result.payment.id, receiptNumber: result.receipt?.receiptNumber };
  }

  private async linkToSession(actor: AuthUser, collectorId: string, generatorId: string, paymentId: string, amount: Decimal) {
    const sessionDate = startOfTodayUTC();
    let session = await this.prisma.collectionSession.findUnique({
      where: { collectorId_generatorId_sessionDate: { collectorId, generatorId, sessionDate } },
    });
    if (!session) {
      const assignments = await this.prisma.collectorAssignment.findMany({
        where: { organizationId: actor.organizationId, collectorId, generatorId, status: 'ACTIVE' },
        select: { customerId: true },
      });
      const customerIds = assignments.map((a) => a.customerId);
      const agg = customerIds.length
        ? await this.prisma.bill.aggregate({
            where: { organizationId: actor.organizationId, customerId: { in: customerIds }, status: { in: [...PAYABLE_STATUSES] } },
            _sum: { outstandingAmount: true },
          })
        : null;
      session = await this.prisma.collectionSession.create({
        data: {
          organizationId: actor.organizationId,
          collectorId,
          generatorId,
          sessionDate,
          openingBalance: '0',
          expectedAmount: (agg?._sum.outstandingAmount ?? new Decimal(0)).toFixed(),
          collectedAmount: '0',
          status: 'OPEN',
        },
      });
    }
    await this.prisma.$transaction([
      this.prisma.payment.update({ where: { id: paymentId }, data: { sessionId: session.id } }),
      this.prisma.collectionSession.update({ where: { id: session.id }, data: { collectedAmount: { increment: amount } } }),
    ]);
  }

  private async upsertSyncTransaction(actor: AuthUser, deviceId: string, tx: SyncPushTransactionDto, status: string, serverEntityId: string | null, error: string | null) {
    await this.prisma.syncTransaction.upsert({
      where: {
        organizationId_clientTransactionId: {
          organizationId: actor.organizationId,
          clientTransactionId: tx.clientTransactionId,
        },
      },
      update: {
        status: status as Prisma.SyncTransactionUpdatestatusInput,
        serverEntityId,
        error,
        syncedAt: status === 'SYNCED' ? new Date() : null,
        attempts: { increment: 1 },
      },
      create: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        deviceId,
        clientTransactionId: tx.clientTransactionId,
        entityType: tx.entityType,
        payload: tx.payload as Prisma.InputJsonValue,
        status: status as Prisma.SyncTransactionCreatestatusInput,
        serverEntityId,
        error,
        syncedAt: status === 'SYNCED' ? new Date() : null,
        attempts: 1,
      },
    });
  }

  // ============ PULL — بيانات الجابي للعمل دون اتصال (§25/§164) ============
  async pull(actor: AuthUser) {
    const collector = await this.resolveCollector(actor.organizationId, actor.userId);
    if (!collector) throw new AppException(ErrorCodes.FORBIDDEN, 'يجب أن يكون لديك ملف جابٍ للسحب', 403);

    const assignments = await this.prisma.collectorAssignment.findMany({
      where: { organizationId: actor.organizationId, collectorId: collector.id, status: 'ACTIVE' },
      include: { customer: { include: { generator: { select: { id: true, name: true } } } } },
    });
    const customerIds = assignments.map((a) => a.customerId);

    const outstandingAgg = customerIds.length
      ? await this.prisma.bill.groupBy({
          by: ['customerId'],
          where: { organizationId: actor.organizationId, customerId: { in: customerIds }, status: { in: [...PAYABLE_STATUSES] } },
          _sum: { outstandingAmount: true },
        })
      : [];
    const outstandingMap = new Map(outstandingAgg.map((o) => [o.customerId, o._sum.outstandingAmount ?? new Decimal(0)]));

    const openBills = customerIds.length
      ? await this.prisma.bill.findMany({
          where: { organizationId: actor.organizationId, customerId: { in: customerIds }, status: { in: [...PAYABLE_STATUSES] } },
          select: { id: true, customerId: true, billNumber: true, totalAmount: true, outstandingAmount: true, dueDate: true, status: true, billingPeriodStart: true, billingPeriodEnd: true },
          orderBy: { dueDate: 'asc' },
        })
      : [];

    return {
      serverTime: new Date().toISOString(),
      collector: { id: collector.id, name: collector.name },
      customers: assignments.map((a) => ({
        customerId: a.customerId,
        customerNumber: a.customer.customerNumber,
        fullName: a.customer.fullName,
        phonePrimary: a.customer.phonePrimary,
        address: a.customer.address,
        neighborhood: a.customer.neighborhood,
        generatorId: a.generatorId,
        generatorName: a.customer.generator.name,
        outstandingBalance: (outstandingMap.get(a.customerId) ?? new Decimal(0)).toFixed(),
      })),
      openBills: openBills.map((b) => ({
        billId: b.id,
        customerId: b.customerId,
        billNumber: b.billNumber,
        totalAmount: b.totalAmount.toString(),
        outstandingAmount: b.outstandingAmount.toString(),
        dueDate: b.dueDate,
        status: b.status,
        billingPeriodStart: b.billingPeriodStart,
        billingPeriodEnd: b.billingPeriodEnd,
      })),
    };
  }

  // ============ RESOLVE CONFLICT (§27) ============
  async resolveConflict(actor: AuthUser, dto: ResolveConflictDto, meta: RequestMeta) {
    const syncTx = await this.prisma.syncTransaction.findFirst({
      where: { id: dto.syncTransactionId, organizationId: actor.organizationId },
    });
    if (!syncTx) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'معاملة المزامنة غير موجودة', 404);
    if (syncTx.status !== 'CONFLICT') {
      throw new AppException(ErrorCodes.INVALID_STATE, 'المعاملة ليست في حالة صراع', 422);
    }

    if (dto.action === 'REJECT') {
      await this.prisma.syncTransaction.update({
        where: { id: syncTx.id },
        data: { status: 'FAILED', error: dto.note ?? 'مرفوض بواسطة المراجع' },
      });
      await this.audit.log({
        organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'sync.conflict_rejected', entityType: 'SyncTransaction', entityId: syncTx.id,
        metadata: { clientTransactionId: syncTx.clientTransactionId, note: dto.note }, meta,
      });
      return { resolved: true, status: 'FAILED' };
    }

    // APPLY: إعادة المحاولة بسياق الجابي الأصلي كي تُنسب الدفعة للجابي الصحيح
    const originalCollector = await this.prisma.collector.findFirst({
      where: { userId: syncTx.userId, organizationId: actor.organizationId },
    });
    if (!originalCollector) {
      throw new AppException(ErrorCodes.INVALID_STATE, 'تعذر العثور على الجابي الأصلي للمعاملة', 422);
    }
    const originalActor: AuthUser = { userId: syncTx.userId, organizationId: actor.organizationId, roles: [], permissions: [] };
    const payload = syncTx.payload as unknown as OfflinePaymentPayload;
    try {
      const result = await this.applyPaymentTransaction(originalActor, originalCollector.id, payload, meta, syncTx.clientTransactionId, syncTx.createdAt.toISOString());
      await this.upsertSyncTransaction(
        originalActor,
        syncTx.deviceId,
        { clientTransactionId: syncTx.clientTransactionId, entityType: syncTx.entityType, payload: payload as Record<string, unknown>, createdOfflineAt: syncTx.createdAt.toISOString() } as SyncPushTransactionDto,
        'SYNCED',
        result.serverEntityId,
        null,
      );
      await this.audit.log({
        organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'sync.conflict_applied', entityType: 'SyncTransaction', entityId: syncTx.id,
        metadata: { clientTransactionId: syncTx.clientTransactionId, serverEntityId: result.serverEntityId }, meta,
      });
      return { resolved: true, status: 'SYNCED', serverEntityId: result.serverEntityId };
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'فشل تطبيق الصراع';
      await this.prisma.syncTransaction.update({
        where: { id: syncTx.id },
        data: { error: errorMsg, attempts: { increment: 1 } },
      });
      return { resolved: false, status: 'CONFLICT', error: errorMsg };
    }
  }

  // ============ STATUS ============
  async status(actor: AuthUser, query: SyncStatusQuery) {
    const collector = await this.resolveCollector(actor.organizationId, actor.userId);
    if (!collector) throw new AppException(ErrorCodes.FORBIDDEN, 'يجب أن يكون لديك ملف جابٍ', 403);
    const where: Prisma.SyncTransactionWhereInput = {
      organizationId: actor.organizationId,
      userId: actor.userId,
      ...(query.deviceId ? { deviceId: query.deviceId } : {}),
    };
    const grouped = await this.prisma.syncTransaction.groupBy({ by: ['status'], where, _count: { id: true } });
    const byStatus: Record<string, number> = {};
    for (const g of grouped) byStatus[g.status] = g._count.id;
    return {
      pending: byStatus['PENDING'] ?? 0,
      syncing: byStatus['SYNCING'] ?? 0,
      synced: byStatus['SYNCED'] ?? 0,
      failed: byStatus['FAILED'] ?? 0,
      conflicts: byStatus['CONFLICT'] ?? 0,
      deviceId: query.deviceId ?? null,
    };
  }
}
