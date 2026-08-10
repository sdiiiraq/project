'use client';

import { useQuery } from '@tanstack/react-query';
import { notFound } from 'next/navigation';
import { MetricCard, ErrorState, LoadingSkeleton, StatusBadge } from '@/components/ui/status';
import { generatorsClient } from '@/lib/api/domains';

/**
 * صفحة تفاصيل المولدة (§44). تُعرض المؤشرات محسوبة من الخادم (§147).
 * التبويبات الفرعية (المشتركون/الفوترة/الوقود...) تُستكمل في الأجزاء التالية.
 */
export function GeneratorDetail({ id }: { id: string }) {
  const { data: generator, isLoading, isError } = useQuery({
    queryKey: ['generator', id],
    queryFn: () => generatorsClient.get(id),
  });
  const { data: dashboard } = useQuery({
    queryKey: ['generator-dashboard', id],
    queryFn: () => generatorsClient.dashboard(id),
  });

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (isError || !generator) return <ErrorState message="تعذر تحميل المولدة" />;
  if (!generator) return notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{generator.name}</h2>
          {generator.code && <p className="text-sm text-muted-foreground">{generator.code}</p>}
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={generator.status} />
          <StatusBadge status={generator.operatingStatus} />
        </div>
      </div>

      {dashboard && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard title="المشتركون النشطون" value={String(dashboard.activeSubscribers ?? 0)} />
          <MetricCard title="الفواتير المصدرة" value={String(dashboard.totalBilled ?? 0)} />
          <MetricCard title="المستحق" value={String(dashboard.outstanding ?? 0)} />
          <MetricCard title="المتأخر" value={String(dashboard.overdue ?? 0)} trend="down" />
        </div>
      )}
    </div>
  );
}
