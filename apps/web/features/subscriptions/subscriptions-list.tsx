'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/core';
import { EmptyState, ErrorState, LoadingSkeleton, MoneyDisplay, StatusBadge } from '@/components/ui/status';
import { subscriptionsClient } from '@/lib/api/domains';
import { usePermissions } from '@/hooks/use-permissions';

export function SubscriptionsList() {
  const { can } = usePermissions();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['subscriptions', page, status],
    queryFn: () => subscriptionsClient.list({ page: String(page), status }),
  });

  if (isLoading) return <LoadingSkeleton rows={5} />;
  if (isError) return <ErrorState message="تعذر تحميل الاشتراكات" onRetry={() => refetch()} />;

  const subscriptions = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="flex h-10 w-44 rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">كل الحالات</option>
          <option value="ACTIVE">نشط</option>
          <option value="SUSPENDED">موقوف</option>
          <option value="CANCELLED">ملغي</option>
          <option value="EXPIRED">منتهي</option>
          <option value="PENDING">معلق</option>
        </select>
        {can('subscription.create') && (
          <Link href="/subscriptions/new"><Button><Plus className="h-4 w-4" /> اشتراك جديد</Button></Link>
        )}
      </div>

      {subscriptions.length === 0 ? (
        <EmptyState message="لا توجد اشتراكات" action={can('subscription.create') ? <Link href="/subscriptions/new"><Button>إنشاء أول اشتراك</Button></Link> : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-right">
              <tr>
                <th className="p-3 font-medium">المشترك</th>
                <th className="p-3 font-medium">الخطة</th>
                <th className="p-3 font-medium">السعر</th>
                <th className="p-3 font-medium">تاريخ البدء</th>
                <th className="p-3 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((s) => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3"><Link href={`/customers/${s.customerId}`} className="font-medium text-primary hover:underline">{s.customer?.fullName ?? '—'}</Link></td>
                  <td className="p-3">{s.amperePlan?.name ?? '—'}</td>
                  <td className="p-3"><MoneyDisplay amount={s.customPrice ?? s.amperePlan?.price ?? '0'} /></td>
                  <td className="p-3">{new Date(s.startDate).toLocaleDateString('ar-IQ')}</td>
                  <td className="p-3"><StatusBadge status={s.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.total > meta.pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">الإجمالي: {meta.total}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Button>
            <Button variant="outline" size="sm" disabled={page * meta.pageSize >= meta.total} onClick={() => setPage(page + 1)}>التالي</Button>
          </div>
        </div>
      )}
    </div>
  );
}
