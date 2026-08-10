'use client';

import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, ErrorState, LoadingSkeleton, MoneyDisplay } from '@/components/ui/status';
import { OfflineRepository } from '@/offline/db';
import { SyncEngine } from '@/offline/sync-engine';
import { useOfflineStore } from '@/stores/offline-store';

/**
 * قائمة المشتركين المعينين للجابي (§25/§164).
 * عند الاتصال: يسحب من الخادم ويخزن محليًا. دون اتصال: يقرأ من IndexedDB.
 */
export default function CollectorCustomersPage() {
  const { isOnline } = useOfflineStore();
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['collector-customers', isOnline],
    queryFn: async () => {
      if (isOnline) {
        await SyncEngine.pullAssignedCustomers();
      }
      return OfflineRepository.getCachedCustomers();
    },
  });

  const customers = (data ?? []).filter((c) =>
    !search || c.fullName.includes(search) || c.customerNumber.includes(search) || c.phonePrimary.includes(search),
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <input
          placeholder="بحث بالاسم أو الرقم أو الهاتف..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-12 w-full rounded-lg border border-input bg-background px-3 pr-10 text-base"
        />
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : isError ? (
        <ErrorState message="تعذر تحميل المشتركين" onRetry={() => refetch()} />
      ) : customers.length === 0 ? (
        <EmptyState message={isOnline ? 'لا يوجد مشتركون معينون' : 'لا توجد بيانات مخزنة محليًا'} />
      ) : (
        <div className="space-y-2">
          {customers.map((c) => (
            <Link key={c.id} href={`/collector/customers/${c.id}`} className="block rounded-xl border bg-card p-4 shadow-sm active:bg-muted/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold">{c.fullName}</p>
                  <p className="text-sm text-muted-foreground">رقم: {c.customerNumber}</p>
                  <p className="text-sm text-muted-foreground" dir="ltr">{c.phonePrimary}</p>
                </div>
                <div className="text-left">
                  <p className="text-xs text-muted-foreground">المستحق</p>
                  <p className="text-lg font-bold text-destructive"><MoneyDisplay amount={c.outstandingBalance} /></p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
