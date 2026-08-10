import { CustomersList } from '@/features/customers/customers-list';

export const metadata = { title: 'المشتركون' };

export default function CustomersPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">المشتركون</h2>
      <CustomersList />
    </div>
  );
}
