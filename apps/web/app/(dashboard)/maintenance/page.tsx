import { MaintenanceList } from '@/features/maintenance/maintenance-list';

export const metadata = { title: 'الصيانة' };

export default function MaintenancePage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">الصيانة</h2>
      <MaintenanceList />
    </div>
  );
}
