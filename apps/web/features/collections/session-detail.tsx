'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/core';
import { ErrorState, LoadingSkeleton, MoneyDisplay, StatusBadge } from '@/components/ui/status';
import { apiClient } from '@/lib/api-client';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * تفاصيل جلسة المطابقة (§29): المتوقع مقابل الفعلي = الفرق.
 * سير العمل: SUBMITTED → RECONCILED أو DISPUTED → APPROVED.
 * الفرق يُسجل صراحةً ولا يُخفى (§29).
 */
export function SessionDetail({ id }: { id: string }) {
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState('');

  const { data: sessions, isLoading, isError, refetch } = useQuery({
    queryKey: ['collection-sessions'],
    queryFn: () => apiClient.collections.sessions() as Promise<Array<Record<string, unknown>>>,
  });

  const session = (sessions ?? []).find((s) => s.id === id);

  const reconcileMutation = useMutation({
    mutationFn: () => apiClient.collections.submitSession(id, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collection-sessions'] });
      setNotes('');
    },
  });

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (isError || !session) return <ErrorState message="تعذر تحميل الجلسة" onRetry={() => refetch()} />;

  const diff = Number(session.difference ?? 0);
  const canReconcile = can('collection.reconcile') && session.status === 'SUBMITTED';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">جلسة المطابقة</h2>
        <StatusBadge status={session.status as string} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">المتوقع</p><p className="mt-1 text-xl font-bold"><MoneyDisplay amount={(session.expectedAmount as string) ?? '0'} /></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">المحصّل</p><p className="mt-1 text-xl font-bold"><MoneyDisplay amount={(session.collectedAmount as string) ?? '0'} /></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">النقد المقدَّم</p><p className="mt-1 text-xl font-bold"><MoneyDisplay amount={(session.cashSubmitted as string) ?? '0'} /></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">الفرق</p><p className={`mt-1 text-xl font-bold ${diff !== 0 ? 'text-destructive' : 'text-green-600'}`}><MoneyDisplay amount={diff} /></p></CardContent></Card>
      </div>

      {diff !== 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          يوجد فرق في المطابقة بمقدار {diff.toLocaleString('ar-IQ')} د.ع. يجب مراجعة هذا الفرق صراحةً قبل الاعتماد.
        </div>
      )}

      {canReconcile && (
        <Card>
          <CardHeader><CardTitle>إجراء المطابقة</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات المطابقة (اختياري)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={2} />
            <div className="flex gap-2">
              <Button onClick={() => reconcileMutation.mutate()} disabled={reconcileMutation.isSubmitting}>
                {reconcileMutation.isSubmitting ? 'جارٍ الحفظ...' : 'تسليم/مطابقة'}
              </Button>
            </div>
            {reconcileMutation.isError && <p className="text-sm text-destructive">تعذر حفظ الإجراء. حاول مرة أخرى.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
