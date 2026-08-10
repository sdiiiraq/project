'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { customersClient, plansClient, subscriptionsClient } from '@/lib/api/domains';
import { useState } from 'react';

const schema = z.object({
  customerId: z.string().min(1, 'اختر المشترك'),
  amperePlanId: z.string().min(1, 'اختر الخطة'),
  startDate: z.string().min(1, 'تاريخ البدء مطلوب'),
  billingCycle: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']).default('MONTHLY'),
  customPrice: z.string().regex(/^\d+(\.\d{1,3})?$/, 'سعر غير صالح').optional().or(z.literal('')),
});
type SubscriptionForm = z.infer<typeof schema>;

export function SubscriptionNew() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [generatorId, setGeneratorId] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SubscriptionForm>({ resolver: zodResolver(schema) });

  const { data: customers } = useQuery({ queryKey: ['customers-all'], queryFn: () => customersClient.list({ pageSize: '200' }) });
  const { data: plans } = useQuery({
    queryKey: ['plans', generatorId],
    queryFn: () => plansClient.list({ generatorId }),
    enabled: Boolean(generatorId),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => subscriptionsClient.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
      router.push('/subscriptions');
    },
  });

  const onSubmit = (data: SubscriptionForm) => {
    createMutation.mutate({ ...data, customPrice: data.customPrice || undefined });
  };

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader><CardTitle>اشتراك جديد</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="customerId">المشترك *</Label>
            <select id="customerId" {...register('customerId')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">اختر المشترك...</option>
              {customers?.items.map((c) => <option key={c.id} value={c.id}>{c.fullName} ({c.customerNumber})</option>)}
            </select>
            {errors.customerId && <p className="text-sm text-destructive">{errors.customerId.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="generatorId">المولدة (لتصفية الخطط)</Label>
            <select id="generatorId" value={generatorId} onChange={(e) => setGeneratorId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">اختر المولدة...</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amperePlanId">الخطة *</Label>
            <select id="amperePlanId" {...register('amperePlanId')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">اختر الخطة...</option>
              {plans?.items.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.ampereAmount} أمبير</option>)}
            </select>
            {errors.amperePlanId && <p className="text-sm text-destructive">{errors.amperePlanId.message}</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">تاريخ البدء *</Label>
              <Input id="startDate" type="date" {...register('startDate')} />
              {errors.startDate && <p className="text-sm text-destructive">{errors.startDate.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="billingCycle">دورة الفوترة</Label>
              <select id="billingCycle" {...register('billingCycle')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="MONTHLY">شهري</option>
                <option value="QUARTERLY">ربع سنوي</option>
                <option value="ANNUAL">سنوي</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="customPrice">سعر مخصص (اختياري)</Label>
            <Input id="customPrice" inputMode="decimal" {...register('customPrice')} />
            {errors.customPrice && <p className="text-sm text-destructive">{errors.customPrice.message}</p>}
          </div>
          {createMutation.isError && <p className="text-sm text-destructive">تعذر إنشاء الاشتراك. تحقق من البيانات.</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>إلغاء</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جارٍ الإنشاء...' : 'إنشاء الاشتراك'}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
