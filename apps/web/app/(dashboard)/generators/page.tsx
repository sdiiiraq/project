import { GeneratorsList } from '@/features/generators/generators-list';

export const metadata = { title: 'المولدات' };

export default function GeneratorsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">المولدات</h2>
      <GeneratorsList />
    </div>
  );
}
