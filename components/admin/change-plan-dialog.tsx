"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Package } from "lucide-react";
import { changeWorkspacePlan } from "@/lib/actions/admin.actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/utils/money";

export function ChangePlanDialog({
  workspaceId,
  plans,
  currentPlanId,
}: {
  workspaceId: string;
  plans: { id: string; name: string; price: number }[];
  currentPlanId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [planId, setPlanId] = useState(currentPlanId ?? "");
  const [loading, setLoading] = useState(false);

  async function onConfirm() {
    if (!planId) return;
    setLoading(true);
    const result = await changeWorkspacePlan({ workspaceId, planId });
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تغيير الباقة");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Package className="h-4 w-4" /> تغيير الباقة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تغيير باقة المولدة</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger>
              <SelectValue placeholder="اختر الباقة" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} — {formatMoney(p.price)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-3">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1">
                إلغاء
              </Button>
            </DialogClose>
            <Button className="flex-1" onClick={onConfirm} disabled={loading || !planId}>
              {loading ? "جارٍ الحفظ..." : "تأكيد"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
