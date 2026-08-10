import { ReportsDashboard } from '@/features/reports/reports-dashboard';

export const metadata = { title: 'التقارير' };

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">التقارير</h2>
      <ReportsDashboard />
    </div>
  );
}
