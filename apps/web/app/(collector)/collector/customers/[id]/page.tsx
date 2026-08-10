'use client';

import { useQuery } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { EmptyState, LoadingSkeleton, MoneyDisplay } from '@/components/ui/status';
import { OfflineRepository } from '@/offline/db';

/** صفحة المشترك للجابي (§47): عرض الرصيد + زر تسجيل دفعة كبير. */
export default function CollectorCustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: customer, isLoading } = useQuery({
    queryKey: ['collector-customer', params.id],
    queryFn: () => OfflineRepository.getCachedCustomer(params.id),
  });

  if (isLoading) return <LoadingSkeleton rows={3} />;
  if (!customer) return <EmptyState message="المشترك غير موجود في الذاكرة المحلية" />;

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <h2 className="text-xl font-bold">{customer.fullName}</h2>
        <p className="text-sm text-muted-foreground">رقم: {customer.customerNumber}</p>
        <p className="text-sm text-muted-foreground" dir="ltr">{customer.phonePrimary}</p>
        {customer.generatorName && <p className="text-sm text-muted-foreground">المولدة: {customer.generatorName}</p>}
        <div className="mt-4 rounded-lg bg-destructive/5 p-4">
          <p className="text-sm text-muted-foreground">الرصيد المستحق</p>
          <p className="text-3xl font-bold text-destructive"><MoneyDisplay amount={customer.outstandingBalance} /></p>
        </div>
      </div>

      <Link href={`/collector/payment?customerId=${customer.id}`} className="block">
        <button className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary p-5 text-lg font-bold text-primary-foreground shadow-sm active:bg-primary/90">
          <Wallet className="h-6 w-6" />
          تسجيل دفعة
        </button>
      </Link>
    </div>
  );
}
