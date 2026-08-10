import { PaymentDetail } from '@/features/payments/payment-detail';

export default function PaymentDetailPage({ params }: { params: { id: string } }) {
  return <PaymentDetail id={params.id} />;
}
