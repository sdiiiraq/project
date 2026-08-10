import { CustomerNew } from '@/features/customers/customer-new';

export const metadata = { title: 'إضافة مشترك' };

export default function CustomerNewPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">إضافة مشترك</h2>
      <CustomerNew />
    </div>
  );
}
