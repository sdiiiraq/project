'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button, Input } from '@/components/ui/core';
import { EmptyState, ErrorState, LoadingSkeleton, MoneyDisplay, StatusBadge } from '@/components/ui/status';
import { customersClient } from '@/lib/api/domains';
import { usePermissions } from '@/hooks/use-permissions';

export function CustomersList() {
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', page, search, status],
    queryFn: () => customersClient.list({ page: String(page), q: search, status }),
  });

  if (isLoading) return <LoadingSkeleton rows={5} />;
  if (isError) return <ErrorState message="تعذر تحميل المشتركين" onRetry={() => refetch()} />;

  const customers = data?.items ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="بحث بالاسم أو الهاتف أو الرقم..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="w-72 pr-9" />
          </div>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
            <option value="">كل الحالات</option>
            <option value="ACTIVE">نشط</option>
            <option value="SUSPENDED">موقوف</option>
            <option value="ARCHIVED">مؤرشف</option>
          </select>
        </div>
        {can('customer.create') && (
          <Link href="/customers/new"><Button><Plus className="h-4 w-4" /> إضافة مشترك</Button></Link>
        )}
      </div>

      {customers.length === 0 ? (
        <EmptyState message="لا يوجد مشتركون بعد" action={can('customer.create') ? <Link href="/customers/new"><Button>إضافة أول مشترك</Button></Link> : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-right">
              <tr>
                <th className="p-3 font-medium">الرقم</th>
                <th className="p-3 font-medium">الاسم</th>
                <th className="p-3 font-medium">الهاتف</th>
                <th className="p-3 font-medium">المولدة</th>
                <th className="p-3 font-medium">الرصيد المستحق</th>
                <th className="p-3 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">{c.customerNumber}</td>
                  <td className="p-3"><Link href={`/customers/${c.id}`} className="font-medium text-primary hover:underline">{c.fullName}</Link></td>
                  <td className="p-3" dir="ltr">{c.phonePrimary}</td>
                  <td className="p-3">{c.generator?.name ?? '—'}</td>
                  <td className="p-3"><MoneyDisplay amount={c.outstandingBalance ?? '0'} /></td>
                  <td className="p-3"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {meta && meta.total > meta.pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">الإجمالي: {meta.total}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Button>
            <Button variant="outline" size="sm" disabled={page * meta.pageSize >= meta.total} onClick={() => setPage(page + 1)}>التالي</Button>
          </div>
        </div>
      )}
    </div>
  );
}
