'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { EmptyState, ErrorState, LoadingSkeleton, MoneyDisplay, StatusBadge } from '@/components/ui/status';
import { fuelClient, generatorsClient } from '@/lib/api/domains';
import { usePermissions } from '@/hooks/use-permissions';

const schema = z.object({
  generatorId: z.string().min(1, 'اختر المولدة'),
  supplierId: z.string().optional(),
  quantity: z.string().regex(/^\d+(\.\d{1,3})?$/, 'قيمة غير صالحة'),
  unit: z.string().min(1),
  unitCost: z.string().regex(/^\d+(\.\d{1,3})?$/, 'قيمة غير صالحة'),
  invoiceNumber: z.string().optional(),
});
type PurchaseForm = z.infer<typeof schema>;

function NewPurchaseForm({ onCreated }: { onCreated: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<PurchaseForm>({
    resolver: zodResolver(schema),
    defaultValues: { unit: 'LITER' },
  });
  const { data: generators } = useQuery({ queryKey: ['generators-all'], queryFn: () => generatorsClient.list({ pageSize: '100' }) });
  const { data: suppliers } = useQuery({ queryKey: ['fuel-suppliers'], queryFn: () => fuelClient.suppliers() });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => fuelClient.createPurchase(data),
    onSuccess: () => { reset(); onCreated(); },
  });

  const onSubmit = (data: PurchaseForm) => {
    createMutation.mutate({ ...data, supplierId: data.supplierId || undefined, invoiceNumber: data.invoiceNumber || undefined });
  };

  return (
    <Card>
      <CardHeader><CardTitle>شراء وقود جديد</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
              <Label htmlFor="supplierId">المورد</Label>
              <select id="supplierId" {...register('supplierId')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">بدون مورد محدد</option>
                {suppliers?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="quantity">الكمية *</Label>
              <Input id="quantity" inputMode="decimal" dir="ltr" {...register('quantity')} />
              {errors.quantity && <p className="text-sm text-destructive">{errors.quantity.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">الوحدة *</Label>
              <select id="unit" {...register('unit')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="LITER">لتر</option>
                <option value="GALLON">غالون</option>
                <option value="BARREL">برميل</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="unitCost">سعر الوحدة (د.ع) *</Label>
              <Input id="unitCost" inputMode="decimal" dir="ltr" {...register('unitCost')} />
              {errors.unitCost && <p className="text-sm text-destructive">{errors.unitCost.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="invoiceNumber">رقم الفاتورة</Label>
            <Input id="invoiceNumber" {...register('invoiceNumber')} />
          </div>
          {createMutation.isError && <p className="text-sm text-destructive">حدث خطأ أثناء حفظ الشراء.</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جارٍ الحفظ...' : 'حفظ الشراء'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function FuelPurchasesList() {
  const { can } = usePermissions();
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['fuel-purchases', status],
    queryFn: () => fuelClient.purchases({ status }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => fuelClient.approvePurchase(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fuel-purchases'] }),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => fuelClient.rejectPurchase(id, { reason: 'مرفوض من قبل المسؤول' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['fuel-purchases'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
          <option value="">كل الحالات</option>
          <option value="PENDING">بانتظار الموافقة</option>
          <option value="APPROVED">معتمد</option>
          <option value="REJECTED">مرفوض</option>
        </select>
        {can('fuel.create') && (
          <Button onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" /> {showForm ? 'إخفاء النموذج' : 'شراء جديد'}</Button>
        )}
      </div>

      {showForm && <NewPurchaseForm onCreated={() => { setShowForm(false); refetch(); }} />}

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : isError ? (
        <ErrorState message="تعذر تحميل مشتريات الوقود" onRetry={() => refetch()} />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState message="لا توجد مشتريات وقود بعد" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-right">
              <tr>
                <th className="p-3 font-medium">التاريخ</th>
                <th className="p-3 font-medium">المولدة</th>
                <th className="p-3 font-medium">الكمية</th>
                <th className="p-3 font-medium">سعر الوحدة</th>
                <th className="p-3 font-medium">الحالة</th>
                {can('fuel.approve') && <th className="p-3 font-medium">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">{p.purchaseDate?.slice(0, 10)}</td>
                  <td className="p-3">{p.generator?.name ?? '—'}</td>
                  <td className="p-3">{p.quantity} {p.unit === 'LITER' ? 'لتر' : p.unit}</td>
                  <td className="p-3"><MoneyDisplay amount={p.unitCost} /></td>
                  <td className="p-3"><StatusBadge status={p.status} /></td>
                  {can('fuel.approve') && (
                    <td className="p-3">
                      {p.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approveMutation.mutate(p.id)}>اعتماد</Button>
                          <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate(p.id)}>رفض</Button>
                        </div>
                      )}
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
