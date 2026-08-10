'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/core';
import { ErrorState, LoadingSkeleton, MetricCard, MoneyDisplay } from '@/components/ui/status';
import { reportsClient } from '@/lib/api/domains';
import { usePermissions } from '@/hooks/use-permissions';

interface RevenueReport { totalRevenue: string; byGenerator: { generatorId: string; generatorName: string | null; amount: string; paymentsCount: number }[] }
interface OutstandingReport {
  totalOutstanding: string; billsCount: number;
  items: { billId: string; billNumber: string; customerName: string; generatorName: string; outstandingAmount: string; dueDate: string; status: string }[];
}
interface ProfitabilityReport {
  totalRevenue: string; totalExpenses: string; netProfitEstimate: string;
  byGenerator: { generatorId: string; generatorName: string | null; revenue: string; expenses: string; netProfitEstimate: string }[];
}

export function ReportsDashboard() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<'revenue' | 'outstanding' | 'profitability'>('revenue');

  const revenueQuery = useQuery({
    queryKey: ['reports-revenue'],
    queryFn: () => reportsClient.revenue() as Promise<RevenueReport>,
    enabled: tab === 'revenue',
  });
  const outstandingQuery = useQuery({
    queryKey: ['reports-outstanding'],
    queryFn: () => reportsClient.outstanding() as Promise<OutstandingReport>,
    enabled: tab === 'outstanding',
  });
  const profitabilityQuery = useQuery({
    queryKey: ['reports-profitability'],
    queryFn: () => reportsClient.profitability() as Promise<ProfitabilityReport>,
    enabled: tab === 'profitability' && can('financial_reports.read'),
  });

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button variant={tab === 'revenue' ? 'default' : 'outline'} onClick={() => setTab('revenue')}>الإيرادات</Button>
        <Button variant={tab === 'outstanding' ? 'default' : 'outline'} onClick={() => setTab('outstanding')}>الذمم المستحقة</Button>
        {can('financial_reports.read') && (
          <Button variant={tab === 'profitability' ? 'default' : 'outline'} onClick={() => setTab('profitability')}>الربحية</Button>
        )}
      </div>

      {tab === 'revenue' && (
        revenueQuery.isLoading ? <LoadingSkeleton rows={4} /> :
        revenueQuery.isError ? <ErrorState message="تعذر تحميل تقرير الإيرادات" onRetry={() => revenueQuery.refetch()} /> :
        <div className="space-y-4">
          <MetricCard title="إجمالي الإيرادات" value={`${Number(revenueQuery.data?.totalRevenue ?? 0).toLocaleString('ar-IQ')} د.ع`} />
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-right"><tr><th className="p-3 font-medium">المولدة</th><th className="p-3 font-medium">عدد الدفعات</th><th className="p-3 font-medium">المبلغ</th></tr></thead>
              <tbody>
                {revenueQuery.data?.byGenerator.map((g) => (
                  <tr key={g.generatorId} className="border-b last:border-0"><td className="p-3">{g.generatorName ?? '—'}</td><td className="p-3">{g.paymentsCount}</td><td className="p-3"><MoneyDisplay amount={g.amount} /></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'outstanding' && (
        outstandingQuery.isLoading ? <LoadingSkeleton rows={4} /> :
        outstandingQuery.isError ? <ErrorState message="تعذر تحميل تقرير الذمم" onRetry={() => outstandingQuery.refetch()} /> :
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <MetricCard title="إجمالي المتبقي" value={`${Number(outstandingQuery.data?.totalOutstanding ?? 0).toLocaleString('ar-IQ')} د.ع`} />
            <MetricCard title="عدد الفواتير" value={String(outstandingQuery.data?.billsCount ?? 0)} />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-right"><tr><th className="p-3 font-medium">رقم الفاتورة</th><th className="p-3 font-medium">العميل</th><th className="p-3 font-medium">المولدة</th><th className="p-3 font-medium">المتبقي</th><th className="p-3 font-medium">الاستحقاق</th></tr></thead>
              <tbody>
                {outstandingQuery.data?.items.map((b) => (
                  <tr key={b.billId} className="border-b last:border-0">
                    <td className="p-3">{b.billNumber}</td><td className="p-3">{b.customerName}</td><td className="p-3">{b.generatorName}</td>
                    <td className="p-3"><MoneyDisplay amount={b.outstandingAmount} /></td><td className="p-3">{b.dueDate?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'profitability' && can('financial_reports.read') && (
        profitabilityQuery.isLoading ? <LoadingSkeleton rows={4} /> :
        profitabilityQuery.isError ? <ErrorState message="تعذر تحميل تقرير الربحية" onRetry={() => profitabilityQuery.refetch()} /> :
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <MetricCard title="الإيرادات" value={`${Number(profitabilityQuery.data?.totalRevenue ?? 0).toLocaleString('ar-IQ')} د.ع`} />
            <MetricCard title="المصاريف" value={`${Number(profitabilityQuery.data?.totalExpenses ?? 0).toLocaleString('ar-IQ')} د.ع`} />
            <MetricCard title="الربح التقديري" value={`${Number(profitabilityQuery.data?.netProfitEstimate ?? 0).toLocaleString('ar-IQ')} د.ع`} />
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-right"><tr><th className="p-3 font-medium">المولدة</th><th className="p-3 font-medium">الإيرادات</th><th className="p-3 font-medium">المصاريف</th><th className="p-3 font-medium">الربح التقديري</th></tr></thead>
              <tbody>
                {profitabilityQuery.data?.byGenerator.map((g) => (
                  <tr key={g.generatorId} className="border-b last:border-0">
                    <td className="p-3">{g.generatorName ?? '—'}</td><td className="p-3"><MoneyDisplay amount={g.revenue} /></td>
                    <td className="p-3"><MoneyDisplay amount={g.expenses} /></td><td className="p-3"><MoneyDisplay amount={g.netProfitEstimate} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
