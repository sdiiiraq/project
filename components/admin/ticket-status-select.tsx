"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeTicketStatus } from "@/lib/actions/admin-support.actions";
import type { SupportTicketStatus } from "@prisma/client";

const LABELS: Record<SupportTicketStatus, string> = {
  OPEN: "مفتوحة",
  IN_PROGRESS: "قيد المعالجة",
  WAITING_FOR_USER: "بانتظار المستخدم",
  RESOLVED: "تم الحل",
  CLOSED: "مغلقة",
};

export function AdminTicketStatusSelect({ ticketId, status }: { ticketId: string; status: SupportTicketStatus }) {
  const [isPending, startTransition] = useTransition();

  function onChange(value: string) {
    startTransition(async () => {
      const result = await changeTicketStatus({ ticketId, status: value });
      if (result && "error" in result) toast.error(result.error);
    });
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(LABELS).map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
