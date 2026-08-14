"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { settleCollectorSchema, type SettleCollectorInput } from "@/lib/validation/operations";
import { settleCollector } from "@/lib/actions/collector.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

function firstDayOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export function SettleCollectorDialog({ collectorUserId, expectedAmount }: { collectorUserId: string; expectedAmount: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SettleCollectorInput>({
    resolver: zodResolver(settleCollectorSchema),
    defaultValues: {
      collectorUserId,
      expectedAmount,
      actualAmount: expectedAmount,
      periodStart: new Date(firstDayOfMonth()),
      periodEnd: new Date(today()),
    },
  });

  async function onSubmit(values: SettleCollectorInput) {
    setLoading(true);
    const result = await settleCollector(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم إنشاء التسوية");
    setOpen(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ClipboardCheck className="h-4 w-4" /> تسوية
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسوية حساب الجابي</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <input type="hidden" {...register("collectorUserId")} value={collectorUserId} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodStart">من تاريخ</Label>
              <Input id="periodStart" type="date" {...register("periodStart")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="periodEnd">إلى تاريخ</Label>
              <Input id="periodEnd" type="date" {...register("periodEnd")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expectedAmount">المبلغ المتوقع</Label>
              <Input id="expectedAmount" type="number" {...register("expectedAmount")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="actualAmount">المبلغ الفعلي</Label>
              <Input id="actualAmount" type="number" {...register("actualAmount")} />
            </div>
          </div>
          {errors.actualAmount && <p className="text-xs text-destructive">{errors.actualAmount.message}</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">ملاحظات (اختياري)</Label>
            <Input id="notes" {...register("notes")} />
          </div>
          <div className="flex gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "جارٍ الحفظ..." : "تأكيد التسوية"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
