'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { EmptyState, ErrorState, LoadingSkeleton, MoneyDisplay, StatusBadge } from '@/components/ui/status';
import { expensesClient, generatorsClient } from '@/lib/api/domains';
import { usePermissions } from '@/hooks/use-permissions';

const schema = z.object({
  generatorId: z.string().optional(),
  categoryId: z.string().min(1, 'اختر الفئة'),
  amount: z.string().regex(/^\d+(\.\d{1,3})?$/, 'قيمة غير صالحة'),
  expenseDate: z.string().min(1, 'التاريخ مطلوب'),
  description: z.string().min(3, 'الوصف مطلوب').max(500),
  paymentMethod: z.string().optional(),
});
type ExpenseForm = z.infer<typeof schema>;

function NewExpenseForm({ onCreated }: { onCreated: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ExpenseForm>({ resolver: zodResolver(schema) });
  const { data: generators } = useQuery({ queryKey: ['generators-all'], queryFn: () => generatorsClient.list({ pageSize: '100' }) });
  const { data: categories } = useQuery({ queryKey: ['expense-categories'], queryFn: () => expensesClient.categories() });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => expensesClient.create(data),
    onSuccess: () => { reset(); onCreated(); },
  });

  const onSubmit = (data: ExpenseForm) => {
    createMutation.mutate({ ...data, generatorId: data.generatorId || undefined, paymentMethod: data.paymentMethod || undefined });
  };

  return (
    <Card>
      <CardHeader><CardTitle>مصروف جديد</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="generatorId">المولدة (اختياري)</Label>
              <select id="generatorId" {...register('generatorId')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">مصروف عام للمنظمة</option>
                {generators?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryId">الفئة *</Label>
              <select id="categoryId" {...register('categoryId')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">اختر الفئة...</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.nameAr ?? c.name}</option>)}
              </select>
              {errors.categoryId && <p className="text-sm text-destructive">{errors.categoryId.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="amount">المبلغ (د.ع) *</Label>
              <Input id="amount" inputMode="decimal" dir="ltr" {...register('amount')} />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="expenseDate">التاريخ *</Label>
              <Input id="expenseDate" type="date" {...register('expenseDate')} />
              {errors.expenseDate && <p className="text-sm text-destructive">{errors.expenseDate.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">الوصف *</Label>
            <Input id="description" {...register('description')} />
            {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
          </div>
          {createMutation.isError && <p className="text-sm text-destructive">حدث خطأ أثناء حفظ المصروف.</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جارٍ الحفظ...' : 'حفظ المصروف'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function ExpensesList() {
  const { can } = usePermissions();
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['expenses', status],
    queryFn: () => expensesClient.list({ status }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => expensesClient.approve(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
  });
  const rejectMutation = useMutation({
    mutationFn: (id: string) => expensesClient.reject(id, { reason: 'مرفوض من قبل المحاسب' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['expenses'] }),
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
        {can('expense.create') && (
          <Button onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" /> {showForm ? 'إخفاء النموذج' : 'مصروف جديد'}</Button>
        )}
      </div>

      {showForm && <NewExpenseForm onCreated={() => { setShowForm(false); refetch(); }} />}

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : isError ? (
        <ErrorState message="تعذر تحميل المصاريف" onRetry={() => refetch()} />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState message="لا توجد مصاريف بعد" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-right">
              <tr>
                <th className="p-3 font-medium">التاريخ</th>
                <th className="p-3 font-medium">الوصف</th>
                <th className="p-3 font-medium">الفئة</th>
                <th className="p-3 font-medium">المولدة</th>
                <th className="p-3 font-medium">المبلغ</th>
                <th className="p-3 font-medium">الحالة</th>
                {can('expense.approve') && <th className="p-3 font-medium">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">{e.expenseDate.slice(0, 10)}</td>
                  <td className="p-3">{e.description}</td>
                  <td className="p-3">{e.category?.nameAr ?? e.category?.name ?? '—'}</td>
                  <td className="p-3">{e.generator?.name ?? 'عام'}</td>
                  <td className="p-3"><MoneyDisplay amount={e.amount} /></td>
                  <td className="p-3"><StatusBadge status={e.status} /></td>
                  {can('expense.approve') && (
                    <td className="p-3">
                      {e.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => approveMutation.mutate(e.id)}>اعتماد</Button>
                          <Button size="sm" variant="outline" onClick={() => rejectMutation.mutate(e.id)}>رفض</Button>
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
