import { ExpensesList } from '@/features/expenses/expenses-list';

export const metadata = { title: 'المصاريف' };

export default function ExpensesPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">المصاريف</h2>
      <ExpensesList />
    </div>
  );
}
