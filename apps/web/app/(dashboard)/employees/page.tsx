import { EmployeesList } from '@/features/employees/employees-list';

export const metadata = { title: 'الموظفون' };

export default function EmployeesPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">الموظفون</h2>
      <EmployeesList />
    </div>
  );
}
