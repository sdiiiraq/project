import { CollectionsDashboard } from '@/features/collections/collections-dashboard';

export const metadata = { title: 'التحصيل' };

export default function CollectionsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">التحصيل</h2>
      <CollectionsDashboard />
    </div>
  );
}
