'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from '@/components/ui/status';
import { employeesClient, generatorsClient } from '@/lib/api/domains';
import { usePermissions } from '@/hooks/use-permissions';

const schema = z.object({
  name: z.string().min(2, 'الاسم مطلوب').max(120),
  phone: z.string().regex(/^07\d{9}$/, 'رقم الهاتف غير صحيح').optional().or(z.literal('')),
  role: z.string().min(2, 'المسمى الوظيفي مطلوب').max(80),
  employeeCode: z.string().min(1, 'رقم الموظف مطلوب').max(40),
  generatorId: z.string().optional(),
});
type EmployeeForm = z.infer<typeof schema>;

function NewEmployeeForm({ onCreated }: { onCreated: () => void }) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<EmployeeForm>({ resolver: zodResolver(schema) });
  const { data: generators } = useQuery({ queryKey: ['generators-all'], queryFn: () => generatorsClient.list({ pageSize: '100' }) });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => employeesClient.create(data),
    onSuccess: () => { reset(); onCreated(); },
  });

  const onSubmit = (data: EmployeeForm) => {
    createMutation.mutate({ ...data, phone: data.phone || undefined, generatorId: data.generatorId || undefined });
  };

  return (
    <Card>
      <CardHeader><CardTitle>موظف جديد</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">الاسم *</Label>
              <Input id="name" {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="employeeCode">رقم الموظف *</Label>
              <Input id="employeeCode" dir="ltr" {...register('employeeCode')} />
              {errors.employeeCode && <p className="text-sm text-destructive">{errors.employeeCode.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role">المسمى الوظيفي *</Label>
              <Input id="role" {...register('role')} />
              {errors.role && <p className="text-sm text-destructive">{errors.role.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">الهاتف</Label>
              <Input id="phone" inputMode="numeric" dir="ltr" {...register('phone')} />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="generatorId">المولدة</Label>
            <select id="generatorId" {...register('generatorId')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">بدون تخصيص</option>
              {generators?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          {createMutation.isError && <p className="text-sm text-destructive">حدث خطأ أثناء حفظ الموظف.</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جارٍ الحفظ...' : 'حفظ الموظف'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function EmployeesList() {
  const { can } = usePermissions();
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['employees'],
    queryFn: () => employeesClient.list(),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => employeesClient.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {can('employee.create') && (
          <Button onClick={() => setShowForm((v) => !v)}><Plus className="h-4 w-4" /> {showForm ? 'إخفاء النموذج' : 'موظف جديد'}</Button>
        )}
      </div>

      {showForm && <NewEmployeeForm onCreated={() => { setShowForm(false); refetch(); }} />}

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : isError ? (
        <ErrorState message="تعذر تحميل الموظفين" onRetry={() => refetch()} />
      ) : (data?.items.length ?? 0) === 0 ? (
        <EmptyState message="لا يوجد موظفون بعد" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-right">
              <tr>
                <th className="p-3 font-medium">الرقم</th>
                <th className="p-3 font-medium">الاسم</th>
                <th className="p-3 font-medium">المسمى الوظيفي</th>
                <th className="p-3 font-medium">المولدة</th>
                <th className="p-3 font-medium">الحالة</th>
                {can('employee.update') && <th className="p-3 font-medium">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3" dir="ltr">{e.employeeCode}</td>
                  <td className="p-3 font-medium">{e.name}</td>
                  <td className="p-3">{e.role}</td>
                  <td className="p-3">{e.generator?.name ?? '—'}</td>
                  <td className="p-3"><StatusBadge status={e.status} /></td>
                  {can('employee.update') && (
                    <td className="p-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => toggleStatusMutation.mutate({ id: e.id, status: e.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })}
                      >
                        {e.status === 'ACTIVE' ? 'إيقاف' : 'تفعيل'}
                      </Button>
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
