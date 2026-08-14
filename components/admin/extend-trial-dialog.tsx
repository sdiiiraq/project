"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Clock } from "lucide-react";
import { extendTrial } from "@/lib/actions/admin.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export function ExtendTrialDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(14);
  const [loading, setLoading] = useState(false);

  async function onConfirm() {
    setLoading(true);
    const result = await extendTrial({ workspaceId, days });
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تمديد الفترة التجريبية");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Clock className="h-4 w-4" /> تمديد تجريبي
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تمديد الفترة التجريبية</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="days">عدد الأيام</Label>
            <Input id="days" type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} />
          </div>
          <div className="flex gap-3">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1">
                إلغاء
              </Button>
            </DialogClose>
            <Button className="flex-1" onClick={onConfirm} disabled={loading}>
              {loading ? "جارٍ الحفظ..." : "تأكيد"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
