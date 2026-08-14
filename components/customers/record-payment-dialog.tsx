"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import { recordPaymentSchema, type RecordPaymentInput } from "@/lib/validation/payment";
import { recordPayment } from "@/lib/actions/payment.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export function RecordPaymentDialog({ customerId, outstanding }: { customerId: string; outstanding: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { customerId, amount: outstanding > 0 ? outstanding : undefined, method: "CASH" },
  });

  async function onSubmit(values: RecordPaymentInput) {
    setLoading(true);
    const result = await recordPayment(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تسجيل الدفعة");
    setOpen(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Wallet className="h-4 w-4" /> تسجيل دفعة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسجيل دفعة</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <input type="hidden" {...register("customerId")} value={customerId} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">المبلغ (د.ع)</Label>
            <Input id="amount" type="number" {...register("amount")} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">ملاحظة (اختياري)</Label>
            <Input id="note" {...register("note")} />
          </div>
          <div className="flex gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "جارٍ الحفظ..." : "تأكيد الدفعة"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
