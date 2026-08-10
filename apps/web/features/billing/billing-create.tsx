'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { EmptyState, ErrorState, LoadingSkeleton, MoneyDisplay } from '@/components/ui/status';
import { billingClient, generatorsClient, type BillPreview } from '@/lib/api/domains';

/**
 * إنشاء فوترة مع معاينة قبل الإصدار (§46/§141).
 * المعاينة تُظهر عدد المشتركين والأساس والخصومات والغرامات والديون السابقة والإجمالي.
 * يتطلب تأكيدًا قبل التوليد النهائي. التوليد idempotent (§181).
 */
export function BillingCreate() {
  const queryClient = useQueryClient();
  const [generatorId, setGeneratorId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [preview, setPreview] = useState<BillPreview | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { data: generators } = useQuery({ queryKey: ['generators-all'], queryFn: () => generatorsClient.list({ pageSize: '100' }) });

  const previewMutation = useMutation({
    mutationFn: () => billingClient.preview({ generatorId, periodStart, periodEnd }),
    onSuccess: (data) => { setPreview(data); setConfirming(false); },
  });

  const generateMutation = useMutation({
    mutationFn: () => billingClient.generate({ generatorId, periodStart, periodEnd }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bills'] });
      setPreview(null);
      setConfirming(false);
    },
  });

  const canPreview = generatorId && periodStart && periodEnd;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Card>
        <CardHeader><CardTitle>توليد الفواتير</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="generatorId">المولدة *</Label>
            <select id="generatorId" value={generatorId} onChange={(e) => { setGeneratorId(e.target.value); setPreview(null); }} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">اختر المولدة...</option>
              {generators?.items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="periodStart">بداية الفترة *</Label>
              <Input id="periodStart" type="date" value={periodStart} onChange={(e) => { setPeriodStart(e.target.value); setPreview(null); }} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodEnd">نهاية الفترة *</Label>
              <Input id="periodEnd" type="date" value={periodEnd} onChange={(e) => { setPeriodEnd(e.target.value); setPreview(null); }} />
            </div>
          </div>
          <Button onClick={() => previewMutation.mutate()} disabled={!canPreview || previewMutation.isPending}>
            {previewMutation.isPending ? 'جارٍ الحساب...' : 'معاينة الحساب'}
          </Button>
          {previewMutation.isError && <p className="text-sm text-destructive">تعذرت المعاينة. تحقق من الفترة والمولدة.</p>}
        </CardContent>
      </Card>

      {previewMutation.isPending && <LoadingSkeleton rows={4} />}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>معاينة الفوترة — {preview.count} مشترك</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">الأساس</p><MoneyDisplay amount={preview.totals.baseCharge ?? '0'} /></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">الخصومات</p><MoneyDisplay amount={preview.totals.discountAmount ?? '0'} /></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">الغرامات</p><MoneyDisplay amount={preview.totals.penaltyAmount ?? '0'} /></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">الديون السابقة</p><MoneyDisplay amount={preview.totals.previousDebt ?? '0'} /></div>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm text-muted-foreground">الإجمالي المستحق</p>
              <p className="mt-1 text-2xl font-bold"><MoneyDisplay amount={preview.totals.totalAmount ?? '0'} /></p>
            </div>

            {preview.rows.length === 0 ? (
              <EmptyState message="لا توجد اشتراكات نشطة في هذه الفترة" />
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50 text-right">
                    <tr>
                      <th className="p-2 font-medium">المشترك</th>
                      <th className="p-2 font-medium">الأساس</th>
                      <th className="p-2 font-medium">الخصم</th>
                      <th className="p-2 font-medium">دين سابق</th>
                      <th className="p-2 font-medium">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.customerId} className="border-b last:border-0">
                        <td className="p-2">{row.customerName}</td>
                        <td className="p-2"><MoneyDisplay amount={row.baseCharge} /></td>
                        <td className="p-2"><MoneyDisplay amount={row.discountAmount} /></td>
                        <td className="p-2"><MoneyDisplay amount={row.previousDebt} /></td>
                        <td className="p-2 font-medium"><MoneyDisplay amount={row.totalAmount} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {preview.count > 0 && (
              <div className="flex items-center justify-end gap-2 border-t pt-4">
                {!confirming ? (
                  <Button onClick={() => setConfirming(true)}>تأكيد وإصدار الفواتير</Button>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">هل أنت متأكد من إصدار {preview.count} فاتورة؟ لا يمكن التراجع بسهولة.</p>
                    <Button variant="outline" onClick={() => setConfirming(false)}>تراجع</Button>
                    <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
                      {generateMutation.isPending ? 'جارٍ الإصدار...' : 'إصدار نهائي'}
                    </Button>
                  </>
                )}
              </div>
            )}
            {generateMutation.isError && <p className="text-sm text-destructive">تعذر إصدار الفواتير. حاول مرة أخرى.</p>}
            {generateMutation.isSuccess && <p className="text-sm text-green-700">تم إصدار الفواتير بنجاح.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
