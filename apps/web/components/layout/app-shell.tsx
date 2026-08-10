'use client';

import {
  BarChart3, Bell, FileText, Fuel, LayoutDashboard, LogOut, Settings, Users, Wrench, Zap,
  Receipt, Wallet, ClipboardList, Activity, UserCog,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { OfflineIndicator } from '@/components/ui/status';
import { Button } from '@/components/ui/core';
import { createT, type Locale } from '@/i18n';
import { useAuthStore } from '@/stores/auth-store';
import { useOfflineStore } from '@/stores/offline-store';
import { cn } from '@/lib/utils';

/**
 * هيكل التطبيق (§98): شريط جانبي واعٍ للصلاحيات (§56).
 * الإخفاء في الواجهة للراحة فقط؛ الخادم يفرض الصلاحيات (§10).
 */
interface NavItem {
  href: string;
  labelKey: string;
  icon: React.ElementType;
  permission?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/generators', labelKey: 'nav.generators', icon: Zap, permission: 'generator.read' },
  { href: '/customers', labelKey: 'nav.customers', icon: Users, permission: 'customer.read' },
  { href: '/subscriptions', labelKey: 'nav.subscriptions', icon: FileText, permission: 'subscription.read' },
  { href: '/billing', labelKey: 'nav.billing', icon: Receipt, permission: 'bill.read' },
  { href: '/collections', labelKey: 'nav.collections', icon: ClipboardList, permission: 'collection.read' },
  { href: '/payments', labelKey: 'nav.payments', icon: Wallet, permission: 'payment.read' },
  { href: '/expenses', labelKey: 'nav.expenses', icon: Wallet, permission: 'expense.read' },
  { href: '/fuel', labelKey: 'nav.fuel', icon: Fuel, permission: 'fuel.read' },
  { href: '/maintenance', labelKey: 'nav.maintenance', icon: Wrench, permission: 'maintenance.read' },
  { href: '/operations', labelKey: 'nav.operations', icon: Activity, permission: 'operations.read' },
  { href: '/employees', labelKey: 'nav.employees', icon: UserCog, permission: 'employee.read' },
  { href: '/reports', labelKey: 'nav.reports', icon: BarChart3, permission: 'reports.read' },
  { href: '/audit', labelKey: 'nav.audit', icon: Bell, permission: 'audit.read' },
  { href: '/settings', labelKey: 'common.settings', icon: Settings, permission: 'settings.read' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, isLoading, fetchMe, logout, hasPermission, hasRole } = useAuthStore();
  const { isOnline, pendingCount } = useOfflineStore();
  const t = createT((user ? 'ar' : 'ar') as Locale);

  useEffect(() => { fetchMe(); }, [fetchMe]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">جارٍ التحميل...</div>;
  }
  if (!isAuthenticated || !user) return null;

  // SUPER_ADMIN لا يرى واجهة المستأجر افتراضيًا (§199)
  const isSuperAdminOnly = hasRole('SUPER_ADMIN') && !hasRole('ORGANIZATION_OWNER');

  const visibleItems = NAV_ITEMS.filter((item) => !item.permission || hasPermission(item.permission));

  return (
    <div dir="rtl" lang="ar" className="flex min-h-screen">
      {/* الشريط الجانبي */}
      <aside className="hidden w-64 flex-col border-l bg-card md:flex">
        <div className="flex h-16 items-center border-b px-6">
          <h1 className="text-lg font-bold text-primary">{t('common.appName')}</h1>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')}
              >
                <Icon className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-4">
          <div className="mb-2 text-sm font-medium">{user.name}</div>
          <Button variant="outline" size="sm" className="w-full" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
            {t('common.logout')}
          </Button>
        </div>
      </aside>

      {/* المحتوى الرئيسي */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-card px-6">
          <div className="md:hidden text-lg font-bold text-primary">{t('common.appName')}</div>
          <div className="flex items-center gap-4">
            <OfflineIndicator isOnline={isOnline} pendingCount={pendingCount} />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
