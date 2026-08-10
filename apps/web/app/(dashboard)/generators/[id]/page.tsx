import { GeneratorDetail } from '@/features/generators/generator-detail';

export default function GeneratorDetailPage({ params }: { params: { id: string } }) {
  return <GeneratorDetail id={params.id} />;
}
