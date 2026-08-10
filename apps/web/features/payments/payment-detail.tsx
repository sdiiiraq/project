'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/core';
import { ErrorState, LoadingSkeleton, MoneyDisplay, StatusBadge } from '@/components/ui/status';
import { ReceiptPreview, type ReceiptData } from '@/components/receipts/receipt-preview';
import { apiClient } from '@/lib/api-client';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * تفاصيل الدفعة مع الوصل والعكس (§22). العكس يتطلب سببًا وإذنًا ولا يحذف ماديًا.
 * المعاملة المعكوسة لا يمكن عكسها مجددًا (§113).
 */
export function PaymentDetail({ id }: { id: string }) {
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const [showReverse, setShowReverse] = useState(false);
  const [reason, setReason] = useState('');

  const { data: payment, isLoading, isError, refetch } = useQuery({
    queryKey: ['payment', id],
    queryFn: () => apiClient.payments.get(id) as Promise<Record<string, unknown>>,
  });
  const { data: receipt } = useQuery({
    queryKey: ['payment-receipt', id],
    queryFn: () => apiClient.payments.receipt(id) as Promise<Record<string, unknown>>,
  });

  const reverseMutation = useMutation({
    mutationFn: (rev: { reason: string }) => apiClient.payments.reverse(id, rev),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment', id] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setShowReverse(false);
      setReason('');
    },
  });

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (isError || !payment) return <ErrorState message="تعذر تحميل الدفعة" onRetry={() => refetch()} />;

  const isReversed = payment.status === 'REVERSED';

  const receiptData: ReceiptData | null = receipt ? {
    organizationName: (receipt.organization as { name?: string })?.name ?? '',
    generatorName: (payment.generator as { name?: string })?.name ?? '',
    receiptNumber: (receipt.receiptNumber as string) ?? '',
    customerName: (payment.customer as { fullName?: string })?.fullName ?? '',
    customerNumber: (payment.customer as { customerNumber?: string })?.customerNumber ?? '',
    dateTime: (payment.paymentDate as string) ?? '',
    amount: (payment.amount as string) ?? '0',
    paymentMethod: (payment.paymentMethod as string) ?? 'CASH',
    billingPeriod: (payment.bill as { billNumber?: string })?.billNumber ?? '—',
    previousBalance: (receipt.previousBalance as string) ?? '0',
    remainingBalance: (receipt.remainingBalance as string) ?? '0',
    collectorName: (payment.collector as { name?: string })?.name,
    reference: (payment.referenceNumber as string) ?? undefined,
    notes: (payment.notes as string) ?? undefined,
  } : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">الدفعة {payment.paymentNumber as string}</h2>
        <StatusBadge status={payment.status as string} />
      </div>

      {isReversed && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          هذه الدفعة معكوسة. السبب: {(payment.reversalReason as string) ?? '—'}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>تفاصيل الدفعة</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">المشترك</span><span>{(payment.customer as { fullName?: string })?.fullName}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">المبلغ</span><MoneyDisplay amount={(payment.amount as string) ?? '0'} /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">الطريقة</span><span>{payment.paymentMethod === 'CASH' ? 'نقدًا' : (payment.paymentMethod as string)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">التاريخ</span><span>{new Date(payment.paymentDate as string).toLocaleString('ar-IQ')}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">المولدة</span><span>{(payment.generator as { name?: string })?.name ?? '—'}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>الوصل</CardTitle></CardHeader>
          <CardContent>
            {receiptData ? <ReceiptPreview receipt={receiptData} /> : <p className="text-muted-foreground">لا يوجد وصل</p>}
          </CardContent>
        </Card>
      </div>

      {!isReversed && can('payment.reverse') && (
        <div className="rounded-lg border p-4">
          {!showReverse ? (
            <Button variant="destructive" onClick={() => setShowReverse(true)}>عكس الدفعة</Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm">عكس الدفعة يتطلب سببًا ولا يمكن التراجع عنه. سيُعاد حساب الرصيد المستحق.</p>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب العكس (إلزامي)" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" rows={2} />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowReverse(false)}>إلغاء</Button>
                <Button variant="destructive" disabled={reason.trim().length < 3 || reverseMutation.isSubmitting} onClick={() => reverseMutation.mutate({ reason })}>
                  {reverseMutation.isSubmitting ? 'جارٍ العكس...' : 'تأكيد العكس'}
                </Button>
              </div>
              {reverseMutation.isError && <p className="text-sm text-destructive">تعذر عكس الدفعة. حاول مرة أخرى.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
