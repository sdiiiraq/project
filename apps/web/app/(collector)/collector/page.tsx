'use client';

import { ClipboardList, RefreshCw, Users, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useOfflineStore } from '@/stores/offline-store';

/** الشاشة الرئيسية للجابي (§47): أزرار كبيرة، حقول قليلة، وصول سريع. */
export default function CollectorHomePage() {
  const { isOnline, pendingCount, syncState } = useOfflineStore();

  const actions = [
    { href: '/collector/customers', label: 'المشتركون', icon: Users, desc: 'عرض المعينين وأرصدتهم' },
    { href: '/collector/payment', label: 'تسجيل دفعة', icon: Wallet, desc: 'دفعة كاملة أو جزئية' },
    { href: '/collector/sync', label: 'المزامنة', icon: RefreshCw, desc: `${pendingCount} بانتظار المزامنة` },
    { href: '/collector/session', label: 'جلسة المطابقة', icon: ClipboardList, desc: 'تسليم النقد والمطابقة' },
  ];

  return (
    <div className="mx-auto max-w-md space-y-4">
      {!isOnline && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800">
          أنت غير متصل. ستُسجل العمليات محليًا وتُزامن تلقائيًا عند العودة.
        </div>
      )}
      {pendingCount > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-800">
          {pendingCount} عملية بانتظار المزامنة.
        </div>
      )}
      <div className="grid grid-cols-1 gap-3">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <Link key={a.href} href={a.href} className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm transition-shadow active:shadow-md">
              <div className="rounded-lg bg-primary/10 p-3"><Icon className="h-7 w-7 text-primary" /></div>
              <div className="flex-1">
                <p className="text-lg font-semibold">{a.label}</p>
                <p className="text-sm text-muted-foreground">{a.desc}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
