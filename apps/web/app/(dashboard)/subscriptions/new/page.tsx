import { SubscriptionNew } from '@/features/subscriptions/subscription-new';

export const metadata = { title: 'اشتراك جديد' };

export default function SubscriptionNewPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">اشتراك جديد</h2>
      <SubscriptionNew />
    </div>
  );
}
