'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { customersClient, generatorsClient } from '@/lib/api/domains';

const schema = z.object({
  generatorId: z.string().min(1, 'اختر المولدة'),
  fullName: z.string().min(2, 'اسم المشترك مطلوب').max(120),
  phonePrimary: z.string().regex(/^07\d{9}$/, 'رقم الهاتف غير صحيح'),
  phoneSecondary: z.string().regex(/^07\d{9}$/, 'رقم الهاتف غير صحيح').optional().or(z.literal('')),
  address: z.string().max(200).optional(),
  neighborhood: z.string().max(80).optional(),
  houseNumber: z.string().max(20).optional(),
});
type CustomerForm = z.infer<typeof schema>;

export function CustomerNew() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<CustomerForm>({ resolver: zodResolver(schema) });

  const { data: generators } = useQuery({ queryKey: ['generators-all'], queryFn: () => generatorsClient.list({ pageSize: '100' }) });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => customersClient.create(data),
    onSuccess: (customer) => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      router.push(`/customers/${customer.id}`);
    },
  });

  const onSubmit = (data: CustomerForm) => {
    createMutation.mutate({ ...data, phoneSecondary: data.phoneSecondary || undefined, address: data.address || undefined, neighborhood: data.neighborhood || undefined, houseNumber: data.houseNumber || undefined });
  };

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader><CardTitle>إضافة مشترك جديد</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="generatorId">المولدة *</Label>
            <select id="generatorId" {...register('generatorId')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">اختر المولدة...</option>
              {generators?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            {errors.generatorId && <p className="text-sm text-destructive">{errors.generatorId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">الاسم الكامل *</Label>
            <Input id="fullName" {...register('fullName')} />
            {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phonePrimary">الهاتف الأساسي *</Label>
              <Input id="phonePrimary" inputMode="numeric" dir="ltr" {...register('phonePrimary')} />
              {errors.phonePrimary && <p className="text-sm text-destructive">{errors.phonePrimary.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phoneSecondary">الهاتف الثانوي</Label>
              <Input id="phoneSecondary" inputMode="numeric" dir="ltr" {...register('phoneSecondary')} />
              {errors.phoneSecondary && <p className="text-sm text-destructive">{errors.phoneSecondary.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="neighborhood">الحي</Label><Input id="neighborhood" {...register('neighborhood')} /></div>
            <div className="space-y-2"><Label htmlFor="houseNumber">رقم الدار</Label><Input id="houseNumber" {...register('houseNumber')} /></div>
            <div className="space-y-2"><Label htmlFor="address">العنوان</Label><Input id="address" {...register('address')} /></div>
          </div>
          {createMutation.isError && <p className="text-sm text-destructive">حدث خطأ أثناء حفظ المشترك. حاول مرة أخرى.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>إلغاء</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جارٍ الحفظ...' : 'حفظ المشترك'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
