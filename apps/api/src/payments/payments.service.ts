import { Injectable } from '@nestjs/common';
import { Decimal, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AppException, ErrorCodes } from '../common/errors';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser, RequestMeta } from '../common/types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto, ListPaymentsQuery, ReversePaymentDto } from './dto';

const PAYABLE_STATUSES = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] as const;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: GeneratorScopeService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(orgId: string, user: AuthUser, query: ListPaymentsQuery) {
    if (query.generatorId) await this.scope.assertGeneratorAccess(orgId, user, query.generatorId);
    const allowed = await this.scope.accessibleGeneratorIds(orgId, user);

    const where: Prisma.PaymentWhereInput = {
      organizationId: orgId,
      ...(allowed ? { generatorId: { in: allowed } } : {}),
      ...(query.generatorId ? { generatorId: query.generatorId } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.collectorId ? { collectorId: query.collectorId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { paymentMethod: query.method } : {}),
      ...(query.from || query.to
        ? { paymentDate: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } }
        : {}),
    };

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: {
          customer: { select: { id: true, fullName: true, customerNumber: true } },
          generator: { select: { id: true, name: true } },
          collector: { select: { id: true, name: true } },
          receipt: { select: { id: true, receiptNumber: true } },
        },
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total } };
  }

  private async loadOwned(orgId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organizationId: orgId },
      include: {
        customer: { select: { id: true, fullName: true, customerNumber: true } },
        generator: { select: { id: true, name: true } },
        collector: { select: { id: true, name: true } },
        bill: { select: { id: true, billNumber: true } },
        receipt: true,
        allocations: { include: { bill: { select: { id: true, billNumber: true } } } },
      },
    });
    if (!payment) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'الدفعة غير موجودة', 404);
    return payment;
  }

  async get(orgId: string, user: AuthUser, id: string) {
    const payment = await this.loadOwned(orgId, id);
    await this.scope.assertGeneratorAccess(orgId, user, payment.generatorId);
    return payment;
  }

  private async nextNumber(tx: Prisma.TransactionClient, orgId: string, kind: 'PAYMENT' | 'RECEIPT', year: number): Promise<string> {
    const seq = await tx.documentSequence.upsert({
      where: { organizationId_kind_year: { organizationId: orgId, kind, year } },
      update: { lastValue: { increment: 1 } },
      create: { organizationId: orgId, kind, year, lastValue: 1 },
    });
    const prefix = kind === 'PAYMENT' ? 'P' : 'R';
    return `${prefix}-${year}-${String(seq.lastValue).padStart(6, '0')}`;
  }

  /** إعادة حساب حالة الفاتورة بعد تغيير الأرصدة — حتمي وبلا غموض */
  private recomputeStatus(paid: Decimal, outstanding: Decimal, dueDate: Date): string {
    if (outstanding.isZero()) return 'PAID';
    const today = new Date();
    const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    if (dueDate.getTime() < utcToday.getTime()) return 'OVERDUE';
    if (paid.greaterThan(0)) return 'PARTIALLY_PAID';
    return 'ISSUED';
  }

  /**
   * إنشاء دفعة — معاملة ذرية كاملة (§88):
   * تحقق → قفل صفّي للفواتير (§89) → تخصيص (§114) → دفعة → تحديث الأرصدة → وصل → تدقيق (§206).
   * منع التكرار عبر offlineTransactionId وIdempotency-Key (§21/§181).
   */
  async create(actor: AuthUser, dto: CreatePaymentDto, meta: RequestMeta, idempotencyKey?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, organizationId: actor.organizationId, deletedAt: null },
    });
    if (!customer) throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'المشترك غير موجود', 404);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, customer.generatorId);

    const amount = new Decimal(dto.amount);
    if (amount.lte(0)) throw new AppException(ErrorCodes.VALIDATION_ERROR, 'المبلغ يجب أن يكون أكبر من صفر', 422);

    // idempotency عبر offlineTransactionId — إعادة الدفعة الموجودة بدل التكرار (§21)
    if (dto.offlineTransactionId) {
      const existing = await this.prisma.payment.findUnique({
        where: {
          organizationId_offlineTransactionId: {
            organizationId: actor.organizationId,
            offlineTransactionId: dto.offlineTransactionId,
          },
        },
      });
      if (existing) {
        return { payment: await this.loadOwned(actor.organizationId, existing.id), deduplicated: true };
      }
    }

    // idempotency عبر ترويسة Idempotency-Key (§181)
    if (idempotencyKey) {
      const record = await this.prisma.idempotencyRecord.findUnique({
        where: { organizationId_key: { organizationId: actor.organizationId, key: idempotencyKey } },
      });
      if (record && record.expiresAt > new Date()) {
        return { payment: await this.loadOwned(actor.organizationId, record.entityId), deduplicated: true };
      }
    }

    const paymentDate = dto.paymentDate ? new Date(dto.paymentDate) : new Date();
    const collector = await this.prisma.collector.findFirst({
      where: { userId: actor.userId, organizationId: actor.organizationId },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      // تحديد الفواتير المستهدفة: فاتورة محددة أو أقدم الديون (§114)
      const targetBills = dto.billId
        ? await tx.bill.findMany({
            where: {
              id: dto.billId, organizationId: actor.organizationId, customerId: customer.id,
              status: { in: [...PAYABLE_STATUSES] }, outstandingAmount: { gt: 0 },
            },
          })
        : await tx.bill.findMany({
            where: {
              organizationId: actor.organizationId, customerId: customer.id,
              status: { in: [...PAYABLE_STATUSES] }, outstandingAmount: { gt: 0 },
            },
            orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
          });

      if (targetBills.length === 0) {
        throw new AppException(ErrorCodes.INVALID_STATE, 'لا توجد فواتير مستحقة للدفع', 422);
      }

      // قفل صفّي للفواتير المستهدفة ثم إعادة القراءة (§89)
      const billIds = targetBills.map((b) => b.id);
      await tx.$queryRaw(Prisma.sql`SELECT id FROM bills WHERE id IN (${Prisma.join(billIds)}) FOR UPDATE`);
      const lockedBills = await tx.bill.findMany({ where: { id: { in: billIds } } });

      // المبلغ المسموح = مجموع مستحق الفواتير المستهدفة — الإفراط في الدفع غير مفعّل (§112/§113-5)
      const targetOutstanding = lockedBills.reduce((s, b) => s.add(b.outstandingAmount), new Decimal(0));
      if (amount.greaterThan(targetOutstanding)) {
        throw new AppException(
          ErrorCodes.INVALID_STATE,
          `المبلغ يتجاوز الرصيد المستحق (${targetOutstanding.toFixed()} د.ع) — الإفراط في الدفع غير مفعّل`,
          422,
        );
      }

      // رصيد المشترك قبل الدفعة (لأغراض الوصل)
      const prevAgg = await tx.bill.aggregate({
        where: { organizationId: actor.organizationId, customerId: customer.id, status: { in: [...PAYABLE_STATUSES] } },
        _sum: { outstandingAmount: true },
      });
      const previousBalance = prevAgg._sum.outstandingAmount ?? new Decimal(0);

      // التخصيص: أقدم الديون أولًا (§114) — لا تطبيق غامض للمال
      let remaining = amount;
      const allocations: { billId: string; amount: Decimal; bill: (typeof lockedBills)[number] }[] = [];
      for (const bill of lockedBills.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())) {
        if (remaining.lte(0)) break;
        const outstanding = new Decimal(bill.outstandingAmount.toString());
        if (outstanding.lte(0)) continue;
        const alloc = Decimal.min(remaining, outstanding);
        allocations.push({ billId: bill.id, amount: alloc, bill });
        remaining = remaining.sub(alloc);
      }

      const year = paymentDate.getUTCFullYear();
      const paymentNumber = await this.nextNumber(tx, actor.organizationId, 'PAYMENT', year);
      const payment = await tx.payment.create({
        data: {
          organizationId: actor.organizationId,
          generatorId: customer.generatorId,
          customerId: customer.id,
          billId: dto.billId ?? allocations[0]?.billId ?? null,
          paymentNumber,
          amount: amount.toFixed(),
          currency: 'IQD',
          paymentMethod: (dto.paymentMethod as 'CASH' | undefined) ?? 'CASH',
          paymentDate,
          collectorId: collector?.id ?? null,
          referenceNumber: dto.referenceNumber,
          offlineTransactionId: dto.offlineTransactionId ?? null,
          status: 'COMPLETED',
          notes: dto.notes,
          createdBy: actor.userId,
        },
      });

      // إنشاء التخصيصات وتحديث أرصدة الفواتير
      for (const alloc of allocations) {
        await tx.paymentAllocation.create({
          data: { paymentId: payment.id, billId: alloc.billId, amount: alloc.amount.toFixed() },
        });
        const paid = new Decimal(alloc.bill.paidAmount.toString()).add(alloc.amount);
        const outstanding = new Decimal(alloc.bill.outstandingAmount.toString()).sub(alloc.amount);
        await tx.bill.update({
          where: { id: alloc.billId },
          data: {
            paidAmount: paid.toFixed(),
            outstandingAmount: outstanding.toFixed(),
            status: this.recomputeStatus(paid, outstanding, alloc.bill.dueDate),
          },
        });
      }

      // الوصل (§28): الأرصدة على مستوى المشترك
      const receiptNumber = await this.nextNumber(tx, actor.organizationId, 'RECEIPT', year);
      const remainingBalance = Decimal.max(previousBalance.sub(amount), new Decimal(0));
      const receipt = await tx.receipt.create({
        data: {
          organizationId: actor.organizationId,
          paymentId: payment.id,
          billId: dto.billId ?? allocations[0]?.billId ?? null,
          receiptNumber,
          amount: amount.toFixed(),
          currency: 'IQD',
          previousBalance: previousBalance.toFixed(),
          remainingBalance: remainingBalance.toFixed(),
          issuedAt: new Date(),
        },
      });

      if (idempotencyKey) {
        await tx.idempotencyRecord.create({
          data: {
            organizationId: actor.organizationId,
            key: idempotencyKey,
            entityType: 'Payment',
            entityId: payment.id,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      }

      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'payment.create', entityType: 'Payment', entityId: payment.id,
        after: {
          amount: amount.toFixed(), customerId: customer.id,
          bills: allocations.map((a) => a.billId),
          offlineTransactionId: dto.offlineTransactionId ?? null,
        },
        metadata: { generatorId: customer.generatorId, customerId: customer.id, requestId: meta.requestId },
        meta,
      });

      return { payment, receipt };
    });

    // الإشعار بعد الالتزام — فشله لا يمس الدفعة (§190/§77/§78)
    try {
      await this.notifications.notifyPaymentReceived(
        actor.organizationId, customer.id, result.payment.id,
        amount.toFixed(), result.receipt.receiptNumber,
      );
    } catch { /* لا انعكاس على الدفعة */ }

    return { payment: await this.loadOwned(actor.organizationId, result.payment.id), receipt: result.receipt, deduplicated: false };
  }

  /**
   * العكس (§22): لا حذف مادي. يتطلب سببًا، يعيد الأرصدة، ويُدقق.
   * الدفعة المعكوسة لا تُعكس مجددًا (§113).
   */
  async reverse(actor: AuthUser, id: string, dto: ReversePaymentDto, meta: RequestMeta) {
    const payment = await this.loadOwned(actor.organizationId, id);
    await this.scope.assertGeneratorAccess(actor.organizationId, actor, payment.generatorId);

    if (payment.status === 'REVERSED') {
      throw new AppException(ErrorCodes.PAYMENT_ALREADY_REVERSED, 'الدفعة معكوسة بالفعل', 422);
    }

    await this.prisma.$transaction(async (tx) => {
      const billIds = payment.allocations.map((a) => a.billId);
      if (billIds.length > 0) {
        await tx.$queryRaw(Prisma.sql`SELECT id FROM bills WHERE id IN (${Prisma.join(billIds)}) FOR UPDATE`);
        const bills = await tx.bill.findMany({ where: { id: { in: billIds } } });

        // عكس التخصيصات: إعادة المبالغ إلى أرصدة الفواتير
        for (const alloc of payment.allocations) {
          const bill = bills.find((b) => b.id === alloc.billId);
          if (!bill) continue;
          const paid = Decimal.max(new Decimal(bill.paidAmount.toString()).sub(alloc.amount), new Decimal(0));
          const outstanding = new Decimal(bill.outstandingAmount.toString()).add(alloc.amount);
          await tx.bill.update({
            where: { id: bill.id },
            data: {
              paidAmount: paid.toFixed(),
              outstandingAmount: outstanding.toFixed(),
              status: this.recomputeStatus(paid, outstanding, bill.dueDate),
            },
          });
        }
      }

      await tx.payment.update({
        where: { id },
        data: { status: 'REVERSED', reversedAt: new Date(), reversedBy: actor.userId, reversalReason: dto.reason },
      });

      if (payment.receipt) {
        await tx.receipt.update({ where: { id: payment.receipt.id }, data: { reversedAt: new Date() } });
      }

      await this.audit.log({
        tx, organizationId: actor.organizationId, actorUserId: actor.userId,
        action: 'payment.reverse', entityType: 'Payment', entityId: id,
        before: { status: payment.status }, after: { status: 'REVERSED' },
        metadata: { generatorId: payment.generatorId, customerId: payment.customerId, reason: dto.reason, requestId: meta.requestId },
        meta,
      });
    });

    return this.loadOwned(actor.organizationId, id);
  }

  async getReceipt(orgId: string, user: AuthUser, paymentId: string) {
    const payment = await this.get(orgId, user, paymentId);
    if (!payment.receipt) {
      throw new AppException(ErrorCodes.RESOURCE_NOT_FOUND, 'لا يوجد وصل لهذه الدفعة', 404);
    }
    return {
      receipt: payment.receipt,
      payment: {
        paymentNumber: payment.paymentNumber,
        amount: payment.amount,
        paymentMethod: payment.paymentMethod,
        paymentDate: payment.paymentDate,
        referenceNumber: payment.referenceNumber,
        status: payment.status,
      },
      organization: await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { name: true } }),
      generator: payment.generator,
      customer: payment.customer,
      collector: payment.collector,
      bill: payment.bill,
    };
  }
}
