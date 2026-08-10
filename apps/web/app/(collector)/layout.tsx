'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useOfflineStore } from '@/stores/offline-store';
import { OfflineIndicator } from '@/components/ui/status';
import { initSyncEngine, SyncEngine } from '@/offline/sync-engine';

/**
 * هيكل واجهة الجابي (§47/§102): أزرار كبيرة، مؤشر مزامنة دائم،
 * أولوية للسرعة على الجماليات. يعمل على أجهزة Android منخفضة النهاية.
 */
export default function CollectorLayout({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false } },
  }));
  const { isAuthenticated, isLoading, fetchMe } = useAuthStore();
  const { isOnline, pendingCount, syncState } = useOfflineStore();

  useEffect(() => { fetchMe(); }, [fetchMe]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      initSyncEngine();
      // مزامنة دورية كل 30 ثانية عند الاتصال
      const interval = setInterval(() => { if (navigator.onLine) void SyncEngine.syncAll(); }, 30_000);
      return () => clearInterval(interval);
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) window.location.href = '/login';
  }, [isLoading, isAuthenticated]);

  if (isLoading) return <div className="flex min-h-screen items-center justify-center text-muted-foreground">جارٍ التحميل...</div>;
  if (!isAuthenticated) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <div dir="rtl" lang="ar" className="flex min-h-screen flex-col bg-muted/30">
        {/* شريط علوي دائم مع مؤشر المزامنة (§186) */}
        <header className="sticky top-0 z-40 border-b bg-card px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-primary">وضع الجباية</span>
            <OfflineIndicator isOnline={isOnline} pendingCount={pendingCount} />
          </div>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </QueryClientProvider>
  );
}
