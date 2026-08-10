import { OutagesList } from '@/features/operations/outages-list';

export const metadata = { title: 'العمليات' };

export default function OperationsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">العمليات — الانقطاعات</h2>
      <OutagesList />
    </div>
  );
}
