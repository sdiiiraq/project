"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteMaintenanceRecord } from "@/lib/actions/maintenance.actions";
import { formatMoney } from "@/lib/utils/money";

export function DeleteMaintenanceRecordButton({
  id,
  type,
  equipmentName,
  cost,
}: {
  id: string;
  type: string;
  equipmentName: string;
  cost: number;
}) {
  return (
    <ConfirmDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="حذف سجل الصيانة">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </DialogTrigger>
      }
      title="حذف سجل الصيانة"
      description={`سيتم حذف سجل "${type} — ${equipmentName}" بمبلغ ${formatMoney(cost)} نهائيًا. لا يمكن التراجع عن هذا الإجراء.`}
      onConfirm={() => deleteMaintenanceRecord({ id })}
      successMessage="تم حذف سجل الصيانة"
    />
  );
}
