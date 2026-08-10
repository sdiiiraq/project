import Link from 'next/link';
import { Button } from '@/components/ui/core';

export const metadata = { title: 'الفوترة' };

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">الفوترة</h2>
        <div className="flex gap-2">
          <Link href="/billing/create"><Button>توليد الفواتير</Button></Link>
          <Link href="/billing/runs"><Button variant="outline">سجلات التوليد</Button></Link>
        </div>
      </div>
      <p className="text-muted-foreground">استخدم «توليد الفواتير» لمعاينة الحساب قبل الإصدار، ثم راجع الفواتير المصدرة.</p>
    </div>
  );
}
