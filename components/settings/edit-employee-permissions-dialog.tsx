"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { updateEmployeePermissions, removeEmployee } from "@/lib/actions/team.actions";
import { PERMISSION_GROUPS, permissionLabel } from "@/lib/rbac/permission-groups";
import type { PermissionKey } from "@/lib/rbac/permissions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function EditEmployeePermissionsDialog({
  memberId,
  employeeName,
  currentPermissions,
  actorPermissions,
}: {
  memberId: string;
  employeeName: string;
  currentPermissions: PermissionKey[];
  actorPermissions: PermissionKey[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<PermissionKey>>(new Set(currentPermissions));
  const actorPermissionSet = new Set(actorPermissions);

  function toggle(key: PermissionKey) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function onSave() {
    setLoading(true);
    const result = await updateEmployeePermissions({ memberId, permissions: Array.from(selected) });
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تحديث صلاحيات الموظف");
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="تعديل الصلاحيات">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>صلاحيات {employeeName}</DialogTitle>
          </DialogHeader>
          <div className="flex max-h-[75svh] flex-col gap-4 overflow-y-auto">
            <div className="flex flex-col gap-3 rounded-xl border border-border p-3">
              {PERMISSION_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{group.label}</p>
                  <div className="flex flex-col gap-1.5">
                    {group.keys.map((key) => {
                      const disabled = !actorPermissionSet.has(key);
                      return (
                        <label key={key} className="flex items-center gap-2 text-sm">
                          <Checkbox checked={selected.has(key)} disabled={disabled} onCheckedChange={() => toggle(key)} />
                          <span className={disabled ? "text-muted-foreground/50" : undefined}>{permissionLabel(key)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="flex-1">
                  إلغاء
                </Button>
              </DialogClose>
              <Button type="button" className="flex-1" disabled={loading} onClick={onSave}>
                {loading ? "جارٍ الحفظ..." : "حفظ الصلاحيات"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        trigger={
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="إزالة الموظف">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </DialogTrigger>
        }
        title={`إزالة ${employeeName}`}
        description="سيفقد هذا الموظف الوصول إلى النظام فورًا. لن يتم حذف حسابه بالكامل، فقط إزالته من هذه المولدة."
        onConfirm={() => removeEmployee({ memberId })}
        successMessage="تمت إزالة الموظف"
      />
    </div>
  );
}
