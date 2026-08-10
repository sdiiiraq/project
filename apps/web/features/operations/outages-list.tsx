'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from '@/components/ui/status';
import { generatorsClient, operationsClient } from '@/lib/api/domains';
import { usePermissions } from '@/hooks/use-permissions';

const schema = z.object({
  generatorId: z.string().min(1, 'اختر المولدة'),
  type: z.string().min(1),
  reason: z.string().min(1, 'السبب مطلوب').max(200),
});
type OutageForm = z.infer<typeof schema>;

function NewOutageForm({ onCreated }: { onCreated: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<OutageForm>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'UNPLANNED' },
  });
  const { data: generators } = useQuery({ queryKey: ['generators-all'], queryFn: () => generatorsClient.list({ pageSize: '100' }) });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => operationsClient.startOutage(data),
    onSuccess: () => { reset(); onCreated(); },
  });

  return (
    <Card>
      <CardHeader><CardTitle>تسجيل انقطاع</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="generatorId">المولدة *</Label>
              <select id="generatorId" {...register('generatorId')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">اختر المولدة...</option>
                {generators?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {errors.generatorId && <p className="text-sm text-destructive">{errors.generatorId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">النوع *</Label>
              <select id="type" {...register('type')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="UNPLANNED">غير مخطط</option>
                <option value="PLANNED">مخطط</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reason">السبب *</Label>
            <Input id="reason" {...register('reason')} />
            {errors.reason && <p className="text-sm text-destructive">{errors.reason.message}</p>}
          </div>
          {createMutation.isError && <p className="text-sm text-destructive">حدث خطأ أثناء تسجيل الانقطاع.</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جارٍ الحفظ...' : 'تسجيل'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function OutagesList() {
  const { can } = usePermissions();
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['operations-outages'],
    queryFn: () => operationsClient.outages(),
  });

  const endMutation = useMutation({
    mutationFn: (id: string) => operationsClient.endOutage(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['operations-outages'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {can('operations.create') && (
          <Button onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" /> {showForm ? 'إخفاء النموذج' : 'تسجيل انقطاع'}</Button>
        )}
      </div>

      {showForm && <NewOutageForm onCreated={() => { setShowForm(false); refetch(); }} />}

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : isError ? (
        <ErrorState message="تعذر تحميل سجلات الانقطاع" onRetry={() => refetch()} />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState message="لا توجد انقطاعات مسجلة" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-right">
              <tr>
                <th className="p-3 font-medium">المولدة</th>
                <th className="p-3 font-medium">النوع</th>
                <th className="p-3 font-medium">السبب</th>
                <th className="p-3 font-medium">بدأ</th>
                <th className="p-3 font-medium">انتهى</th>
                {can('operations.update') && <th className="p-3 font-medium">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((o) => (
                <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">{o.generator?.name ?? '—'}</td>
                  <td className="p-3">{o.type === 'PLANNED' ? 'مخطط' : 'غير مخطط'}</td>
                  <td className="p-3">{o.reason}</td>
                  <td className="p-3">{o.startedAt?.slice(0, 16).replace('T', ' ')}</td>
                  <td className="p-3">{o.endedAt ? <StatusBadge status="ACTIVE" label="انتهى" /> : <StatusBadge status="FAULT" label="مستمر" />}</td>
                  {can('operations.update') && (
                    <td className="p-3">
                      {!o.endedAt && <Button size="sm" onClick={() => endMutation.mutate(o.id)}>إنهاء الانقطاع</Button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
