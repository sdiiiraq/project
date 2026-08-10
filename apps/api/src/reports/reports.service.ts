import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';
import { ReportRangeQuery } from './dto';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: GeneratorScopeService,
  ) {}

  private async scopedGeneratorFilter(actor: AuthUser, requestedGeneratorId?: string) {
    if (requestedGeneratorId) {
      await this.scope.assertGeneratorAccess(actor.organizationId, actor, requestedGeneratorId);
      return { generatorId: requestedGeneratorId };
    }
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    return allowed ? { generatorId: { in: allowed } } : {};
  }

  /** تقرير الإيرادات (§ التقارير): الدفعات المكتملة مجمّعة حسب المولدة ضمن النطاق الزمني */
  async revenue(actor: AuthUser, query: ReportRangeQuery) {
    const generatorFilter = await this.scopedGeneratorFilter(actor, query.generatorId);
    const where: Prisma.PaymentWhereInput = {
      organizationId: actor.organizationId,
      status: 'COMPLETED',
      ...generatorFilter,
      ...(query.from || query.to
        ? {
            paymentDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };

    const [grouped, generators] = await Promise.all([
      this.prisma.payment.groupBy({ by: ['generatorId'], where, _sum: { amount: true }, _count: { _all: true } }),
      this.prisma.generator.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true } }),
    ]);
    const nameById = new Map(generators.map((g) => [g.id, g.name]));

    const byGenerator = grouped.map((g) => ({
      generatorId: g.generatorId,
      generatorName: nameById.get(g.generatorId) ?? null,
      amount: (g._sum.amount ?? 0).toString(),
      paymentsCount: g._count._all,
    }));

    return {
      totalRevenue: byGenerator.reduce((sum, g) => sum + Number(g.amount), 0).toString(),
      byGenerator,
    };
  }

  /** تقرير الذمم المستحقة (§ التقارير): الفواتير غير المسددة بالكامل مجمّعة حسب العميل */
  async outstanding(actor: AuthUser, query: ReportRangeQuery) {
    const generatorFilter = await this.scopedGeneratorFilter(actor, query.generatorId);
    const where: Prisma.BillWhereInput = {
      organizationId: actor.organizationId,
      status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      ...generatorFilter,
    };

    const bills = await this.prisma.bill.findMany({
      where,
      select: {
        id: true, billNumber: true, outstandingAmount: true, dueDate: true, status: true,
        customer: { select: { id: true, fullName: true } },
        generator: { select: { id: true, name: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 500,
    });

    const items = bills.map((b) => ({
      billId: b.id,
      billNumber: b.billNumber,
      customerId: b.customer.id,
      customerName: b.customer.fullName,
      generatorId: b.generator.id,
      generatorName: b.generator.name,
      outstandingAmount: b.outstandingAmount.toString(),
      dueDate: b.dueDate,
      status: b.status,
    }));

    return {
      totalOutstanding: items.reduce((sum, b) => sum + Number(b.outstandingAmount), 0).toString(),
      billsCount: items.length,
      items,
    };
  }

  /** تقرير الربحية التقديري (§ التقارير): إيرادات محصّلة − مصاريف معتمدة لكل مولدة ضمن النطاق */
  async profitability(actor: AuthUser, query: ReportRangeQuery) {
    const generatorFilter = await this.scopedGeneratorFilter(actor, query.generatorId);
    const dateRange = query.from || query.to
      ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined }
      : undefined;

    const [revenueGrouped, expenseGrouped, generators] = await Promise.all([
      this.prisma.payment.groupBy({
        by: ['generatorId'],
        where: {
          organizationId: actor.organizationId,
          status: 'COMPLETED',
          ...generatorFilter,
          ...(dateRange ? { paymentDate: dateRange } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.expense.groupBy({
        by: ['generatorId'],
        where: {
          organizationId: actor.organizationId,
          status: 'APPROVED',
          ...generatorFilter,
          ...(dateRange ? { expenseDate: dateRange } : {}),
        },
        _sum: { amount: true },
      }),
      this.prisma.generator.findMany({ where: { organizationId: actor.organizationId }, select: { id: true, name: true } }),
    ]);
    const nameById = new Map(generators.map((g) => [g.id, g.name]));
    const revenueById = new Map(revenueGrouped.map((r) => [r.generatorId, r._sum.amount?.toNumber() ?? 0]));
    const expenseById = new Map(
      expenseGrouped.filter((e) => e.generatorId !== null).map((e) => [e.generatorId as string, e._sum.amount?.toNumber() ?? 0]),
    );

    const generatorIds = new Set([...revenueById.keys(), ...expenseById.keys()]);
    const items = Array.from(generatorIds).map((generatorId) => {
      const revenue = revenueById.get(generatorId) ?? 0;
      const expenses = expenseById.get(generatorId) ?? 0;
      return {
        generatorId,
        generatorName: nameById.get(generatorId) ?? null,
        revenue: revenue.toString(),
        expenses: expenses.toString(),
        netProfitEstimate: (revenue - expenses).toString(),
      };
    });

    const totalRevenue = items.reduce((sum, i) => sum + Number(i.revenue), 0);
    const totalExpenses = items.reduce((sum, i) => sum + Number(i.expenses), 0);

    return {
      totalRevenue: totalRevenue.toString(),
      totalExpenses: totalExpenses.toString(),
      netProfitEstimate: (totalRevenue - totalExpenses).toString(),
      byGenerator: items,
    };
  }
}
