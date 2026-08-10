import { FuelPurchasesList } from '@/features/fuel/fuel-purchases-list';

export const metadata = { title: 'الوقود' };

export default function FuelPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">الوقود</h2>
      <FuelPurchasesList />
    </div>
  );
}
