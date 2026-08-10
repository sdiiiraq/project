'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/core';
import { EmptyState, LoadingSkeleton, MoneyDisplay, StatusBadge } from '@/components/ui/status';
import { OfflineRepository } from '@/offline/db';
import { ConflictResolver, SyncEngine } from '@/offline/sync-engine';
import { useOfflineStore } from '@/stores/offline-store';

/**
 * صفحة المزامنة للجابي (§186): يجب ألا يتساءل الجابي أبدًا عما إذا كانت
 * الدفعة قد سُجلت. تعرض كل معاملة وحالتها، مع زر مزامنة يدوية وحل الصراعات.
 */
export default function CollectorSyncPage() {
  const queryClient = useQueryClient();
  const { isOnline, pendingCount } = useOfflineStore();
  const [syncing, setSyncing] = useState(false);

  const { data: payments, isLoading, refetch } = useQuery({
    queryKey: ['local-payments'],
    queryFn: () => OfflineRepository.getAllLocalPayments(),
  });

  const handleSync = async () => {
    setSyncing(true);
    await SyncEngine.syncAll();
    await refetch();
    setSyncing(false);
  };

  const handleResolve = async (clientTransactionId: string, action: 'APPLY' | 'REJECT') => {
    await ConflictResolver.resolve(clientTransactionId, action);
    await refetch();
  };

  const sorted = [...(payments ?? [])].sort((a, b) => b.createdOfflineAt.localeCompare(a.createdOfflineAt));

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">المزامنة</h2>
        <Button onClick={handleSync} disabled={syncing || !isOnline}>
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'جارٍ المزامنة...' : 'مزامنة الآن'}
        </Button>
      </div>

      {!isOnline && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800">
          أنت غير متصل. ستُزامن العمليات تلقائيًا عند العودة.
        </div>
      )}

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : sorted.length === 0 ? (
        <EmptyState message="لا توجد معاملات محلية" />
      ) : (
        <div className="space-y-2">
          {sorted.map((p) => (
            <div key={p.clientTransactionId} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{p.customerName}</p>
                  <p className="text-sm"><MoneyDisplay amount={p.amount} /></p>
                  <p className="text-xs text-muted-foreground">{new Date(p.createdOfflineAt).toLocaleString('ar-IQ')}</p>
                  {p.receiptNumber && <p className="text-xs text-green-700">وصل: {p.receiptNumber}</p>}
                  {p.errorMessage && <p className="text-xs text-destructive">{p.errorMessage}</p>}
                </div>
                <StatusBadge status={p.syncStatus} />
              </div>
              {p.syncStatus === 'CONFLICT' && (
                <div className="mt-3 flex gap-2 border-t pt-3">
                  <p className="mb-2 w-full text-xs text-orange-700">تعارض مع حالة الخادم. اختر إجراءً:</p>
                  <Button size="sm" onClick={() => handleResolve(p.clientTransactionId, 'APPLY')}>تطبيق</Button>
                  <Button size="sm" variant="outline" onClick={() => handleResolve(p.clientTransactionId, 'REJECT')}>رفض</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
