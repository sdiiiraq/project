'use client';

import { cn } from '@/lib/utils';

/** شارة حالة ملونة واضحة (§98/§171) */
const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-700',
  ON: 'bg-green-100 text-green-800',
  OFF: 'bg-gray-200 text-gray-700',
  MAINTENANCE: 'bg-yellow-100 text-yellow-800',
  FAULT: 'bg-red-100 text-red-800',
  UNKNOWN: 'bg-gray-100 text-gray-600',
  PAID: 'bg-green-100 text-green-800',
  PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800',
  OVERDUE: 'bg-red-100 text-red-800',
  ISSUED: 'bg-blue-100 text-blue-800',
  DRAFT: 'bg-gray-100 text-gray-700',
  VOID: 'bg-gray-300 text-gray-700',
  PENDING: 'bg-yellow-100 text-yellow-800',
  SYNCED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
  CONFLICT: 'bg-orange-100 text-orange-800',
  ARCHIVED: 'bg-gray-200 text-gray-600',
  SUSPENDED: 'bg-orange-100 text-orange-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700', className)}>
      {label ?? status}
    </span>
  );
}

/** عرض المبلغ — القيمة محسوبة في الخادم (§147) */
export function MoneyDisplay({ amount, className }: { amount: string | number; className?: string }) {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return <span className={cn('tabular-nums font-medium', className)}>{Number.isNaN(n) ? '0' : n.toLocaleString('ar-IQ')} د.ع</span>;
}

/** بطاقة مؤشر للوحة التحكم (§40) */
export function MetricCard({ title, value, hint, trend }: { title: string; value: string; hint?: string; trend?: 'up' | 'down' }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className={cn('mt-1 text-2xl font-bold', trend === 'down' ? 'text-destructive' : trend === 'up' ? 'text-green-600' : '')}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** حالة فارغة (§136) مع إجراء تالٍ اختياري */
export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <p className="text-muted-foreground">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** حالة خطأ (§137) مع رقم العملية اختياريًا */
export function ErrorState({ message, requestId, onRetry }: { message: string; requestId?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
      <p className="text-destructive">{message}</p>
      {requestId && <p className="mt-1 text-xs text-muted-foreground">رقم العملية: {requestId}</p>}
      {onRetry && (
        <button onClick={onRetry} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">إعادة المحاولة</button>
      )}
    </div>
  );
}

/** هيكل تحميل (§135) */
export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
      ))}
    </div>
  );
}

/** مؤشر حالة المزامنة دون اتصال (§186) — يجب أن يكون واضحًا دائمًا */
export function OfflineIndicator({ isOnline, pendingCount }: { isOnline: boolean; pendingCount: number }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${isOnline ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
      <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-600' : 'bg-orange-600'}`} />
      {isOnline ? 'متصل' : 'غير متصل'}
      {pendingCount > 0 && <span className="rounded-full bg-white/60 px-1.5">{pendingCount} بانتظار المزامنة</span>}
    </div>
  );
}
