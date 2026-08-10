import { SessionDetail } from '@/features/collections/session-detail';

export default function SessionDetailPage({ params }: { params: { id: string } }) {
  return <SessionDetail id={params.id} />;
}
