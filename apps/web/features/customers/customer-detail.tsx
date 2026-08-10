'use client';

import { useQuery } from '@tanstack/react-query';
import { ErrorState, LoadingSkeleton, MoneyDisplay, StatusBadge } from '@/components/ui/status';
import { customersClient } from '@/lib/api/domains';
import { useState } from 'react';

const TABS = ['نظرة عامة', 'الاشتراكات', 'الفواتير', 'المدفوعات', 'الدين', 'النشاط'] as const;
type Tab = typeof TABS[number];

/**
 * صفحة تفاصيل المشترك بتبويبات (§43). البيانات من الخادم (§147).
 * يُستكمل تبويبا الإشعارات والنشاط التفصيلي في الأجزاء التالية.
 */
export function CustomerDetail({ id }: { id: string }) {
  const [activeTab, setActiveTab] = useState<Tab>('نظرة عامة');

  const { data: customer, isLoading, isError } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => customersClient.get(id),
  });
  const { data: subscriptions } = useQuery({
    queryKey: ['customer-subscriptions', id],
    queryFn: () => customersClient.subscriptions(id),
    enabled: activeTab === 'الاشتراكات',
  });
  const { data: bills } = useQuery({
    queryKey: ['customer-bills', id],
    queryFn: () => customersClient.bills(id),
    enabled: activeTab === 'الفواتير',
  });
  const { data: payments } = useQuery({
    queryKey: ['customer-payments', id],
    queryFn: () => customersClient.payments(id),
    enabled: activeTab === 'المدفوعات',
  });

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (isError || !customer) return <ErrorState message="تعذر تحميل المشترك" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{customer.fullName}</h2>
          <p className="text-sm text-muted-foreground">رقم المشترك: {customer.customerNumber} · <span dir="ltr">{customer.phonePrimary}</span></p>
        </div>
        <StatusBadge status={customer.status} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">الرصيد المستحق</p>
          <p className="mt-1 text-xl font-bold"><MoneyDisplay amount={customer.outstandingBalance ?? '0'} /></p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">المولدة</p>
          <p className="mt-1 font-medium">{customer.generator?.name ?? '—'}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">العنوان</p>
          <p className="mt-1 text-sm">{customer.address ?? customer.neighborhood ?? '—'}</p>
        </div>
      </div>

      <div className="border-b">
        <div className="flex gap-4 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`whitespace-nowrap border-b-2 px-2 py-2 text-sm font-medium transition-colors ${activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[200px]">
        {activeTab === 'نظرة عامة' && (
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">الحي:</span> {customer.neighborhood ?? '—'}</p>
            <p><span className="text-muted-foreground">رقم الدار:</span> {customer.houseNumber ?? '—'}</p>
          </div>
        )}
        {activeTab === 'الاشتراكات' && (
          <div className="space-y-2">
            {(subscriptions ?? []).length === 0 ? (
              <p className="text-muted-foreground">لا توجد اشتراكات</p>
            ) : (
              subscriptions!.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{s.amperePlan?.name ?? 'خطة'}</p>
                    <p className="text-xs text-muted-foreground">بدأ: {new Date(s.startDate).toLocaleDateString('ar-IQ')}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'الفواتير' && (
          <div className="space-y-2">
            {(bills ?? []).length === 0 ? (
              <p className="text-muted-foreground">لا توجد فواتير</p>
            ) : (
              (bills as Array<Record<string, unknown>>).map((b) => (
                <div key={b.id as string} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{b.billNumber as string}</p>
                    <p className="text-xs text-muted-foreground">{new Date(b.issueDate as string).toLocaleDateString('ar-IQ')}</p>
                  </div>
                  <div className="text-left">
                    <MoneyDisplay amount={(b.totalAmount as string) ?? '0'} />
                    <div className="mt-1"><StatusBadge status={b.status as string} /></div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'المدفوعات' && (
          <div className="space-y-2">
            {(payments ?? []).length === 0 ? (
              <p className="text-muted-foreground">لا توجد دفعات ضمن الفترة المحددة</p>
            ) : (
              (payments as Array<Record<string, unknown>>).map((p) => (
                <div key={p.id as string} className="flex items-center justify-between rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{new Date(p.paymentDate as string).toLocaleDateString('ar-IQ')}</p>
                  <MoneyDisplay amount={(p.amount as string) ?? '0'} />
                </div>
              ))
            )}
          </div>
        )}
        {activeTab === 'الدين' && (
          <div className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">إجمالي الدين المستحق</p>
            <p className="mt-1 text-2xl font-bold"><MoneyDisplay amount={customer.outstandingBalance ?? '0'} /></p>
          </div>
        )}
        {activeTab === 'النشاط' && <p className="text-muted-foreground">يُعرض سجل النشاط في الجزء التالي.</p>}
      </div>
    </div>
  );
}
