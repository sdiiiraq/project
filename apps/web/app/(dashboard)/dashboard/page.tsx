'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingSkeleton, MetricCard } from '@/components/ui/status';
import { createT } from '@/i18n';
import { apiClient } from '@/lib/api-client';
import { formatIQD } from '@/lib/utils';

/**
 * لوحة تحكم المالك (§40/§109): كل الأرقام محسوبة في الخادم (§147).
 * تُستكمل المؤشرات التشغيلية والتنبيهات في الجزء التالي.
 */
interface DashboardOverview {
  totalBilled: string;
  totalCollected: string;
  outstanding: string;
  overdue: string;
  expenses: string;
  netProfitEstimate: string;
  cashCollectedToday: string;
  activeSubscribers: number;
}

export default function DashboardPage() {
  const t = createT();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => apiClient.dashboard.overview() as Promise<DashboardOverview>,
  });

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (isError || !data) return <ErrorState message="تعذر تحميل اللوحة" onRetry={() => refetch()} />;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">{t('nav.dashboard')}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title={t('dashboard.totalBilled')} value={formatIQD(data.totalBilled)} />
        <MetricCard title={t('dashboard.totalCollected')} value={formatIQD(data.totalCollected)} trend="up" />
        <MetricCard title={t('dashboard.outstanding')} value={formatIQD(data.outstanding)} />
        <MetricCard title={t('dashboard.overdue')} value={formatIQD(data.overdue)} trend="down" />
        <MetricCard title={t('dashboard.expenses')} value={formatIQD(data.expenses)} />
        <MetricCard title={t('dashboard.netProfit')} value={formatIQD(data.netProfitEstimate)} hint="تقدير تشغيلي" />
        <MetricCard title={t('dashboard.cashCollected')} value={formatIQD(data.cashCollectedToday)} />
        <MetricCard title={t('dashboard.activeSubscribers')} value={String(data.activeSubscribers)} />
      </div>
    </div>
  );
}
