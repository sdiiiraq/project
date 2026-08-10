import { PaymentsList } from '@/features/payments/payments-list';

export const metadata = { title: 'المدفوعات' };

export default function PaymentsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">المدفوعات</h2>
      <PaymentsList />
    </div>
  );
}
