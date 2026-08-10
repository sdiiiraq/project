'use client';

import { useQuery } from '@tanstack/react-query';
import { EmptyState, LoadingSkeleton, MoneyDisplay } from '@/components/ui/status';
import { apiClient } from '@/lib/api-client';

/** جلسة المطابقة للجابي (§29): يرى المتوقع مقابل المحصّل قبل التسليم. */
export default function CollectorSessionPage() {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ['collector-sessions'],
    queryFn: () => apiClient.collections.sessions() as Promise<Array<Record<string, unknown>>>,
  });

  if (isLoading) return <LoadingSkeleton rows={3} />;

  const open = (sessions ?? []).find((s) => s.status === 'OPEN');

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h2 className="text-xl font-bold">جلسة المطابقة</h2>
      {!open ? (
        <EmptyState message="لا توجد جلسة مفتوحة حاليًا" />
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">المتوقع</span><MoneyDisplay amount={(open.expectedAmount as string) ?? '0'} /></div>
            <div className="mt-2 flex justify-between"><span className="text-muted-foreground">المحصّل</span><MoneyDisplay amount={(open.collectedAmount as string) ?? '0'} /></div>
            <div className="mt-2 flex justify-between border-t pt-2 font-bold">
              <span>الفرق</span>
              <MoneyDisplay amount={Number(open.difference ?? 0)} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">عند انتهاء الجولة، سلّم الجلسة للمدير للمطابقة والاعتماد.</p>
        </div>
      )}
    </div>
  );
}
