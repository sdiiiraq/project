'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ErrorState, LoadingSkeleton, MetricCard, MoneyDisplay, StatusBadge } from '@/components/ui/status';
import { Button } from '@/components/ui/core';
import { apiClient } from '@/lib/api-client';
import { formatIQD } from '@/lib/utils';

/**
 * لوحة التحصيل للمالك/المدير (§48): متوقع اليوم، محصّل اليوم، المستحق، المتأخر،
 * ترتيب الجباة، حالة المطابقة. الأرقام من الخادم (§147).
 */
export function CollectionsDashboard() {
  const { data: sessions, isLoading, isError, refetch } = useQuery({
    queryKey: ['collection-sessions'],
    queryFn: () => apiClient.collections.sessions() as Promise<Array<Record<string, unknown>>>,
  });

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (isError) return <ErrorState message="تعذر تحميل بيانات التحصيل" onRetry={() => refetch()} />;

  const items = sessions ?? [];
  const open = items.filter((s) => s.status === 'OPEN');
  const pendingReconcile = items.filter((s) => s.status === 'SUBMITTED');
  const disputed = items.filter((s) => s.status === 'DISPUTED');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard title="جلسات مفتوحة" value={String(open.length)} />
        <MetricCard title="بانتظار المطابقة" value={String(pendingReconcile.length)} />
        <MetricCard title="متنازع عليها" value={String(disputed.length)} trend={disputed.length > 0 ? 'down' : undefined} />
        <MetricCard title="إجمالي الجلسات" value={String(items.length)} />
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold">جلسات المطابقة</h3>
        {items.length === 0 ? (
          <p className="text-muted-foreground">لا توجد جلسات مطابقة بعد</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-right">
                <tr>
                  <th className="p-3 font-medium">التاريخ</th>
                  <th className="p-3 font-medium">الجابي</th>
                  <th className="p-3 font-medium">المتوقع</th>
                  <th className="p-3 font-medium">المحصّل</th>
                  <th className="p-3 font-medium">الفرق</th>
                  <th className="p-3 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => {
                  const diff = Number(s.difference ?? 0);
                  return (
                    <tr key={s.id as string} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3">{new Date(s.sessionDate as string).toLocaleDateString('ar-IQ')}</td>
                      <td className="p-3">{(s.collector as { name?: string })?.name ?? '—'}</td>
                      <td className="p-3"><MoneyDisplay amount={(s.expectedAmount as string) ?? '0'} /></td>
                      <td className="p-3"><MoneyDisplay amount={(s.collectedAmount as string) ?? '0'} /></td>
                      <td className={`p-3 font-medium ${diff !== 0 ? 'text-destructive' : 'text-green-600'}`}>{formatIQD(diff)}</td>
                      <td className="p-3"><Link href={`/collections/${s.id}`} className="hover:underline"><StatusBadge status={s.status as string} /></Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
