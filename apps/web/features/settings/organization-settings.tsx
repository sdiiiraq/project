'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { ErrorState, LoadingSkeleton } from '@/components/ui/status';
import { organizationsClient } from '@/lib/api/domains';
import { usePermissions } from '@/hooks/use-permissions';

const schema = z.object({
  name: z.string().min(2, 'اسم المنظمة مطلوب').max(120),
  legalName: z.string().max(160).optional().or(z.literal('')),
  phone: z.string().regex(/^07\d{9}$/, 'رقم الهاتف غير صحيح').optional().or(z.literal('')),
  email: z.string().email('بريد إلكتروني غير صحيح').max(160).optional().or(z.literal('')),
  address: z.string().max(200).optional().or(z.literal('')),
  city: z.string().max(80).optional().or(z.literal('')),
  governorate: z.string().max(80).optional().or(z.literal('')),
});
type OrgForm = z.infer<typeof schema>;

export function OrganizationSettings() {
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['organization-me'], queryFn: () => organizationsClient.me() });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<OrgForm>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (data) {
      reset({
        name: data.name,
        legalName: data.legalName ?? '',
        phone: data.phone ?? '',
        email: data.email ?? '',
        address: data.address ?? '',
        city: data.city ?? '',
        governorate: data.governorate ?? '',
      });
    }
  }, [data, reset]);

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => organizationsClient.update(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organization-me'] }),
  });

  const onSubmit = (form: OrgForm) => {
    updateMutation.mutate({
      name: form.name,
      legalName: form.legalName || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      city: form.city || undefined,
      governorate: form.governorate || undefined,
    });
  };

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (isError) return <ErrorState message="تعذر تحميل بيانات المنظمة" onRetry={() => refetch()} />;

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>الملف التعريفي للمنظمة</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">اسم المنظمة *</Label>
              <Input id="name" disabled={!can('organization.update')} {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="legalName">الاسم القانوني</Label>
              <Input id="legalName" disabled={!can('organization.update')} {...register('legalName')} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">الهاتف</Label>
              <Input id="phone" dir="ltr" disabled={!can('organization.update')} {...register('phone')} />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" dir="ltr" disabled={!can('organization.update')} {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="governorate">المحافظة</Label><Input id="governorate" disabled={!can('organization.update')} {...register('governorate')} /></div>
            <div className="space-y-2"><Label htmlFor="city">المدينة</Label><Input id="city" disabled={!can('organization.update')} {...register('city')} /></div>
            <div className="space-y-2"><Label htmlFor="address">العنوان</Label><Input id="address" disabled={!can('organization.update')} {...register('address')} /></div>
          </div>
          {updateMutation.isError && <p className="text-sm text-destructive">حدث خطأ أثناء حفظ الإعدادات.</p>}
          {updateMutation.isSuccess && <p className="text-sm text-green-600">تم الحفظ بنجاح.</p>}
          {can('organization.update') && (
            <div className="flex justify-end">
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}</Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
