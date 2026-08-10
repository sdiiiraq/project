'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button } from '@/components/ui/core';
import { EmptyState, LoadingSkeleton, MoneyDisplay } from '@/components/ui/status';
import { OfflineRepository, generateClientTransactionId, getDeviceId, type LocalPayment } from '@/offline/db';
import { SyncEngine } from '@/offline/sync-engine';
import { useOfflineStore } from '@/stores/offline-store';

/**
 * تسجيل دفعة الجابي (§142/§143).
 * - عند الاتصال: تُرسل للخادم مباشرة عبر collections/payment.
 * - دون اتصال: تُخزن محليًا مع clientTransactionId وتُزامن لاحقًا (§26).
 * - تأكيد واضح: لا ندّعي تأكيد الخادم عند الأوفلاين (§187).
 */
function PaymentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetCustomerId = searchParams.get('customerId') ?? '';
  const { isOnline } = useOfflineStore();

  const [customerId, setCustomerId] = useState(presetCustomerId);
  const [amount, setAmount] = useState('');
  const [confirmation, setConfirmation] = useState<{ type: 'synced' | 'local'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: customers } = useQuery({
    queryKey: ['collector-customers'],
    queryFn: () => OfflineRepository.getCachedCustomers(),
  });

  const selectedCustomer = (customers ?? []).find((c) => c.id === customerId);

  const handleSubmit = async () => {
    if (!customerId || !amount || Number(amount) <= 0) return;
    setSubmitting(true);
    const clientTransactionId = generateClientTransactionId();
    const payment: LocalPayment = {
      clientTransactionId,
      customerId,
      customerName: selectedCustomer?.fullName ?? '',
      amount,
      paymentMethod: 'CASH',
      paymentDate: new Date().toISOString(),
      createdOfflineAt: new Date().toISOString(),
      deviceId: getDeviceId(),
      syncStatus: 'PENDING',
    };

    try {
      if (isOnline) {
        // إرسال مباشر مع idempotency key (§21)
        const token = sessionStorage.getItem('access_token');
        const res = await fetch('/api/v1/collections/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ ...payment, offlineTransactionId: clientTransactionId }),
        });
        if (res.ok) {
          payment.syncStatus = 'SYNCED';
          await OfflineRepository.saveLocalPayment(payment);
          setConfirmation({ type: 'synced', message: 'تم تسجيل الدفعة وتأكيدها من الخادم.' });
        } else {
          throw new Error('فشل الإرسال');
        }
      } else {
        await OfflineRepository.saveLocalPayment(payment);
        setConfirmation({ type: 'local', message: 'تم تسجيل العملية محلياً، بانتظار المزامنة.' });
      }
      await SyncEngine.updateStoreCounts();
      setAmount('');
    } catch {
      // فشل الإرسال المباشر — احفظ محليًا ليُزامن لاحقًا (§211-79 لا فقدان)
      await OfflineRepository.saveLocalPayment(payment);
      setConfirmation({ type: 'local', message: 'تعذر الاتصال. تم حفظ العملية محليًا وستُزامن تلقائيًا.' });
      await SyncEngine.updateStoreCounts();
      setAmount('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">المشترك</label>
        <select
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base"
        >
          <option value="">اختر المشترك...</option>
          {(customers ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.fullName} ({c.customerNumber})</option>
          ))}
        </select>
      </div>

      {selectedCustomer && (
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p>الرصيد المستحق: <span className="font-bold text-destructive"><MoneyDisplay amount={selectedCustomer.outstandingBalance} /></span></p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">المبلغ (د.ع)</label>
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
          className="h-14 w-full rounded-lg border border-input bg-background px-3 text-center text-2xl font-bold"
          placeholder="0"
        />
      </div>

      {confirmation && (
        <div className={`rounded-lg p-4 text-sm ${confirmation.type === 'synced' ? 'bg-green-50 text-green-800' : 'bg-yellow-50 text-yellow-800'}`}>
          {confirmation.message}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!customerId || !amount || Number(amount) <= 0 || submitting}
        className="w-full rounded-xl bg-primary p-5 text-lg font-bold text-primary-foreground shadow-sm active:bg-primary/90 disabled:opacity-50"
      >
        {submitting ? 'جارٍ التسجيل...' : 'تأكيد الدفعة'}
      </button>
    </div>
  );
}

export default function CollectorPaymentPage() {
  return (
    <Suspense fallback={<LoadingSkeleton rows={3} />}>
      <PaymentForm />
    </Suspense>
  );
}
