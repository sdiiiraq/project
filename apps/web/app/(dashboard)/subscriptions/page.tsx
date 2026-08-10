import { SubscriptionsList } from '@/features/subscriptions/subscriptions-list';

export const metadata = { title: 'الاشتراكات' };

export default function SubscriptionsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">الاشتراكات</h2>
      <SubscriptionsList />
    </div>
  );
}
