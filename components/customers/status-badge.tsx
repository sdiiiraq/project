import { Badge } from "@/components/ui/badge";
import type { CustomerStatus } from "@prisma/client";

const STATUS_CONFIG: Record<CustomerStatus, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  ACTIVE: { label: "فعّال", variant: "success" },
  OVERDUE: { label: "متأخر", variant: "warning" },
  SUSPENDED: { label: "موقوف", variant: "destructive" },
  DISCONNECTED: { label: "مقطوع", variant: "secondary" },
};

export function CustomerStatusBadge({ status }: { status: CustomerStatus }) {
  const config = STATUS_CONFIG[status];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
