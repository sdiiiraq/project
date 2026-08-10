import { AuditLogList } from '@/features/audit/audit-log-list';

export const metadata = { title: 'سجل التدقيق' };

export default function AuditPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">سجل التدقيق</h2>
      <AuditLogList />
    </div>
  );
}
