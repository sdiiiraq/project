import { BillingCreate } from '@/features/billing/billing-create';

export const metadata = { title: 'توليد الفواتير' };

export default function BillingCreatePage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">توليد الفواتير</h2>
      <BillingCreate />
    </div>
  );
}
