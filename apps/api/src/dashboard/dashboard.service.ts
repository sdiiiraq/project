import { Injectable } from '@nestjs/common';
import { GeneratorScopeService } from '../common/generator-scope.service';
import type { AuthUser } from '../common/types';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: GeneratorScopeService,
  ) {}

  /**
   * ملخص لوحة تحكم المالك (§40/§109). كل الأرقام محسوبة في الخادم (§147)
   * ويحترم نطاق المولدات المسموح للمستخدم دائمًا (§10). الشكل مطابق
   * لواجهة DashboardOverview المستهلكة في الواجهة الأمامية.
   */
  async overview(actor: AuthUser) {
    const allowed = await this.scope.accessibleGeneratorIds(actor.organizationId, actor);
    const generatorFkScope = allowed ? { generatorId: { in: allowed } } : {};

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);

    const [billedAgg, collectedAgg, outstandingAgg, overdueAgg, expensesAgg, activeSubscriptions, cashTodayAgg] =
      await Promise.all([
        this.prisma.bill.aggregate({
          where: { organizationId: actor.organizationId, status: { not: 'VOID' }, ...generatorFkScope },
          _sum: { totalAmount: true },
        }),
        this.prisma.payment.aggregate({
          where: { organizationId: actor.organizationId, status: 'COMPLETED', ...generatorFkScope },
          _sum: { amount: true },
        }),
        this.prisma.bill.aggregate({
          where: {
            organizationId: actor.organizationId,
            status: { in: ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
            ...generatorFkScope,
          },
          _sum: { outstandingAmount: true },
        }),
        this.prisma.bill.aggregate({
          where: { organizationId: actor.organizationId, status: 'OVERDUE', ...generatorFkScope },
          _sum: { outstandingAmount: true },
        }),
        this.prisma.expense.aggregate({
          where: { organizationId: actor.organizationId, status: 'APPROVED', ...generatorFkScope },
          _sum: { amount: true },
        }),
        this.prisma.subscription.count({
          where: { organizationId: actor.organizationId, status: 'ACTIVE', ...generatorFkScope },
        }),
        this.prisma.payment.aggregate({
          where: {
            organizationId: actor.organizationId,
            status: 'COMPLETED',
            paymentDate: { gte: startOfToday },
            ...generatorFkScope,
          },
          _sum: { amount: true },
        }),
      ]);

    const totalCollected = collectedAgg._sum.amount?.toNumber() ?? 0;
    const totalExpenses = expensesAgg._sum.amount?.toNumber() ?? 0;

    return {
      totalBilled: (billedAgg._sum.totalAmount ?? 0).toString(),
      totalCollected: (collectedAgg._sum.amount ?? 0).toString(),
      outstanding: (outstandingAgg._sum.outstandingAmount ?? 0).toString(),
      overdue: (overdueAgg._sum.outstandingAmount ?? 0).toString(),
      expenses: (expensesAgg._sum.amount ?? 0).toString(),
      netProfitEstimate: (totalCollected - totalExpenses).toString(),
      cashCollectedToday: (cashTodayAgg._sum.amount ?? 0).toString(),
      activeSubscribers: activeSubscriptions,
    };
  }
}
