'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from '@/components/ui/status';
import { generatorsClient, maintenanceClient } from '@/lib/api/domains';
import { usePermissions } from '@/hooks/use-permissions';

const schema = z.object({
  generatorId: z.string().min(1, 'اختر المولدة'),
  type: z.string().min(2, 'نوع الصيانة مطلوب').max(80),
  description: z.string().min(3, 'الوصف مطلوب').max(1000),
});
type MaintenanceForm = z.infer<typeof schema>;

function NewMaintenanceForm({ onCreated }: { onCreated: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<MaintenanceForm>({ resolver: zodResolver(schema) });
  const { data: generators } = useQuery({ queryKey: ['generators-all'], queryFn: () => generatorsClient.list({ pageSize: '100' }) });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => maintenanceClient.create(data),
    onSuccess: () => { reset(); onCreated(); },
  });

  return (
    <Card>
      <CardHeader><CardTitle>طلب صيانة جديد</CardTitle></CardHeader>
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
              <Label htmlFor="type">نوع الصيانة *</Label>
              <Input id="type" placeholder="دورية، طارئة..." {...register('type')} />
              {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">الوصف *</Label>
            <Input id="description" {...register('description')} />
            {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
          </div>
          {createMutation.isError && <p className="text-sm text-destructive">حدث خطأ أثناء حفظ طلب الصيانة.</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جارٍ الحفظ...' : 'حفظ الطلب'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function MaintenanceList() {
  const { can } = usePermissions();
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['maintenance', status],
    queryFn: () => maintenanceClient.list({ status }),
  });

  const startMutation = useMutation({
    mutationFn: (id: string) => maintenanceClient.start(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance'] }),
  });
  const completeMutation = useMutation({
    mutationFn: (id: string) => maintenanceClient.complete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance'] }),
  });
  const cancelMutation = useMutation({
    mutationFn: (id: string) => maintenanceClient.cancel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['maintenance'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">كل الحالات</option>
          <option value="PLANNED">مخطط</option>
          <option value="IN_PROGRESS">جارٍ</option>
          <option value="COMPLETED">مكتمل</option>
          <option value="CANCELLED">ملغى</option>
        </select>
        {can('maintenance.create') && (
          <Button onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" /> {showForm ? 'إخفاء النموذج' : 'طلب صيانة'}</Button>
        )}
      </div>

      {showForm && <NewMaintenanceForm onCreated={() => { setShowForm(false); refetch(); }} />}

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : isError ? (
        <ErrorState message="تعذر تحميل سجلات الصيانة" onRetry={() => refetch()} />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState message="لا توجد سجلات صيانة بعد" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-right">
              <tr>
                <th className="p-3 font-medium">التاريخ</th>
                <th className="p-3 font-medium">المولدة</th>
                <th className="p-3 font-medium">النوع</th>
                <th className="p-3 font-medium">الوصف</th>
                <th className="p-3 font-medium">الحالة</th>
                {can('maintenance.update') && <th className="p-3 font-medium">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">{m.date?.slice(0, 10)}</td>
                  <td className="p-3">{m.generator?.name ?? '—'}</td>
                  <td className="p-3">{m.type}</td>
                  <td className="p-3">{m.description}</td>
                  <td className="p-3"><StatusBadge status={m.status} /></td>
                  {can('maintenance.update') && (
                    <td className="p-3">
                      <div className="flex gap-2">
                        {m.status === 'PLANNED' && <Button size="sm" onClick={() => startMutation.mutate(m.id)}>بدء</Button>}
                        {m.status === 'IN_PROGRESS' && <Button size="sm" onClick={() => completeMutation.mutate(m.id)}>إكمال</Button>}
                        {(m.status === 'PLANNED' || m.status === 'IN_PROGRESS') && (
                          <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate(m.id)}>إلغاء</Button>
                        )}
                      </div>
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
