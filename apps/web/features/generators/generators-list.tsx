'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Zap } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from '@/components/ui/status';
import { generatorsClient, type Generator } from '@/lib/api/domains';
import { usePermissions } from '@/hooks/use-permissions';

const createSchema = z.object({
  name: z.string().min(2, 'اسم المولدة مطلوب').max(120),
  code: z.string().max(40).optional(),
  city: z.string().max(80).optional(),
  governorate: z.string().max(80).optional(),
  phone: z.string().regex(/^07\d{9}$/, 'رقم الهاتف غير صحيح').optional().or(z.literal('')),
  fuelType: z.enum(['DIESEL', 'GASOLINE', 'GAS', 'HYBRID', 'OTHER']).default('DIESEL'),
});
type CreateGeneratorForm = z.infer<typeof createSchema>;

export function GeneratorsList() {
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['generators', page, search],
    queryFn: () => generatorsClient.list({ page: String(page), q: search }),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateGeneratorForm>({
    resolver: zodResolver(createSchema),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => generatorsClient.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generators'] });
      setShowCreate(false);
      reset();
    },
  });

  const onSubmit = (data: CreateGeneratorForm) => {
    createMutation.mutate({ ...data, phone: data.phone || undefined, code: data.code || undefined, city: data.city || undefined, governorate: data.governorate || undefined });
  };

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (isError) return <ErrorState message="تعذر تحميل المولدات" onRetry={() => refetch()} />;

  const generators = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Input placeholder="بحث بالاسم أو الرمز..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-64" />
        </div>
        {can('generator.create') && (
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> إضافة مولدة</Button>
        )}
      </div>

      {generators.length === 0 ? (
        <EmptyState
          message="لا توجد مولدات بعد"
          action={can('generator.create') ? <Button onClick={() => setShowCreate(true)}>إضافة أول مولدة</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {generators.map((g) => <GeneratorCard key={g.id} generator={g} />)}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <Card className="w-full max-w-md">
            <CardHeader><CardTitle>إضافة مولدة جديدة</CardTitle></CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">اسم المولدة *</Label>
                  <Input id="name" {...register('name')} />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="code">الرمز</Label>
                    <Input id="code" {...register('code')} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fuelType">نوع الوقود</Label>
                    <select id="fuelType" {...register('fuelType')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="DIESEL">ديزل</option>
                      <option value="GASOLINE">بنزين</option>
                      <option value="GAS">غاز</option>
                      <option value="HYBRID">هجين</option>
                      <option value="OTHER">أخرى</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label htmlFor="city">المدينة</Label><Input id="city" {...register('city')} /></div>
                  <div className="space-y-2"><Label htmlFor="governorate">المحافظة</Label><Input id="governorate" {...register('governorate')} /></div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">الهاتف</Label>
                  <Input id="phone" inputMode="numeric" {...register('phone')} />
                  {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
                </div>
                {createMutation.isError && <p className="text-sm text-destructive">تعذر حفظ المولدة. حاول مرة أخرى.</p>}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
                  <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'جارٍ الحفظ...' : 'حفظ'}</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function GeneratorCard({ generator }: { generator: Generator }) {
  return (
    <Link href={`/generators/${generator.id}`}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-primary/10 p-2"><Zap className="h-5 w-5 text-primary" /></div>
              <div>
                <h3 className="font-semibold">{generator.name}</h3>
                {generator.code && <p className="text-xs text-muted-foreground">{generator.code}</p>}
              </div>
            </div>
            <StatusBadge status={generator.operatingStatus} />
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>{generator.city ?? '—'}</span>
            <StatusBadge status={generator.status} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
