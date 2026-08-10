'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/status';
import { auditClient } from '@/lib/api/domains';

export function AuditLogList() {
  const [action, setAction] = useState('');

  const { data: actions } = useQuery({ queryKey: ['audit-actions'], queryFn: () => auditClient.actions() });
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit-log', action],
    queryFn: () => auditClient.list({ action }),
  });

  return (
    <div className="space-y-4">
      <select value={action} onChange={(e) => setAction(e.target.value)} className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
        <option value="">كل الإجراءات</option>
        {actions?.map((a) => <option key={a.action} value={a.action}>{a.action} ({a.count})</option>)}
      </select>

      {isLoading ? (
        <LoadingSkeleton rows={6} />
      ) : isError ? (
        <ErrorState message="تعذر تحميل سجل التدقيق" onRetry={() => refetch()} />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState message="لا توجد سجلات بعد" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-right">
              <tr>
                <th className="p-3 font-medium">الوقت</th>
                <th className="p-3 font-medium">المستخدم</th>
                <th className="p-3 font-medium">الإجراء</th>
                <th className="p-3 font-medium">الكيان</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((entry) => (
                <tr key={entry.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3" dir="ltr">{entry.createdAt?.slice(0, 19).replace('T', ' ')}</td>
                  <td className="p-3">{entry.actor?.name ?? 'النظام'}</td>
                  <td className="p-3" dir="ltr">{entry.action}</td>
                  <td className="p-3">{entry.entityType}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
