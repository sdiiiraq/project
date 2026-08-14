import { Badge } from "@/components/ui/badge";
import type { SupportTicketStatus } from "@prisma/client";

const CONFIG: Record<SupportTicketStatus, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  OPEN: { label: "مفتوحة", variant: "warning" },
  IN_PROGRESS: { label: "قيد المعالجة", variant: "secondary" },
  WAITING_FOR_USER: { label: "بانتظار ردك", variant: "warning" },
  RESOLVED: { label: "تم الحل", variant: "success" },
  CLOSED: { label: "مغلقة", variant: "secondary" },
};

export function TicketStatusBadge({ status }: { status: SupportTicketStatus }) {
  const c = CONFIG[status];
  return <Badge variant={c.variant}>{c.label}</Badge>;
}
