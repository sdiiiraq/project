"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { addBillingCredit } from "@/lib/actions/admin.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export function AddCreditDialog({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function onConfirm() {
    if (amount <= 0) return;
    setLoading(true);
    const result = await addBillingCredit({ workspaceId, amount, note });
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تمت إضافة الرصيد");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Gift className="h-4 w-4" /> إضافة رصيد
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة رصيد للمولدة</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">المبلغ (د.ع)</Label>
            <Input id="amount" type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">ملاحظة (اختياري)</Label>
            <Input id="note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex gap-3">
            <DialogClose asChild>
              <Button variant="outline" className="flex-1">
                إلغاء
              </Button>
            </DialogClose>
            <Button className="flex-1" onClick={onConfirm} disabled={loading || amount <= 0}>
              {loading ? "جارٍ الحفظ..." : "تأكيد"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
