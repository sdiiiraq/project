"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeWorkspaceStatus } from "@/lib/actions/admin.actions";
import type { WorkspaceStatus } from "@prisma/client";

const LABELS: Record<WorkspaceStatus, string> = { ACTIVE: "فعّال", SUSPENDED: "موقوف", DISABLED: "معطّل" };

export function ChangeStatusSelect({ workspaceId, status }: { workspaceId: string; status: WorkspaceStatus }) {
  const [isPending, startTransition] = useTransition();

  function onChange(value: string) {
    startTransition(async () => {
      const result = await changeWorkspaceStatus({ workspaceId, status: value });
      if (result && "error" in result) toast.error(result.error);
      else toast.success("تم تحديث الحالة");
    });
  }

  return (
    <Select value={status} onValueChange={onChange} disabled={isPending}>
      <SelectTrigger className="w-36">
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
