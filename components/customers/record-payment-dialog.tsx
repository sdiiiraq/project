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
import { formatMoney } from "@/lib/utils/money";

export function RecordPaymentDialog({
  customerId,
  customerName,
  outstanding,
  subscriptionAmperes,
  subscriptionPrice,
}: {
  customerId: string;
  customerName: string;
  outstanding: number;
  subscriptionAmperes: number;
  subscriptionPrice: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"full" | "partial">("full");
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<RecordPaymentInput>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: { customerId, amount: outstanding > 0 ? outstanding : undefined, method: "CASH" },
  });

  const amountValue = Number(watch("amount")) || 0;
  const remainingAfter = Math.max(0, outstanding - amountValue);

  function selectFull() {
    setMode("full");
    setValue("amount", outstanding);
  }

  function selectPartial() {
    setMode("partial");
    setValue("amount", undefined as unknown as number);
  }

  async function onSubmit(values: RecordPaymentInput) {
    setLoading(true);
    const result = await recordPayment(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    const paidRemaining = Math.max(0, outstanding - values.amount);
    toast.success(
      paidRemaining > 0
        ? `تم التسديد. المتبقي على ${customerName}: ${formatMoney(paidRemaining)}`
        : `تم تسديد الاشتراك بالكامل — لا يوجد مبلغ متبقٍ على ${customerName}`,
    );
    setOpen(false);
    setMode("full");
    reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setMode("full");
          setValue("amount", outstanding > 0 ? outstanding : (undefined as unknown as number));
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Wallet className="h-4 w-4" /> دفع الاشتراك
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسديد مبلغ الاشتراك</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <input type="hidden" {...register("customerId")} value={customerId} />

          {subscriptionAmperes > 0 && (
            <div className="rounded-xl border border-border bg-secondary/40 p-3 text-sm">
              <p className="text-muted-foreground">
                {subscriptionAmperes} أمبير × {formatMoney(subscriptionPrice)} = {formatMoney(subscriptionAmperes * subscriptionPrice)} شهريًا
              </p>
              <p className="mt-1 font-semibold">المبلغ المستحق الكلي: {formatMoney(outstanding)}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button type="button" variant={mode === "full" ? "default" : "outline"} onClick={selectFull} disabled={outstanding <= 0}>
              دفع الاشتراك الكلي
            </Button>
            <Button type="button" variant={mode === "partial" ? "default" : "outline"} onClick={selectPartial}>
              تسديد قسم
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">المبلغ (د.ع)</Label>
            <Input
              id="amount"
              type="number"
              max={outstanding > 0 ? outstanding : undefined}
              readOnly={mode === "full"}
              {...register("amount")}
            />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>

          {mode === "partial" && amountValue > 0 && (
            <div className="rounded-xl border border-border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">المبلغ الكلي</span>
                <span>{formatMoney(outstanding)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">المدفوع الآن</span>
                <span className="text-success">{formatMoney(amountValue)}</span>
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span>المتبقي على {customerName}</span>
                <span className="text-warning">{formatMoney(remainingAfter)}</span>
              </div>
            </div>
          )}

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
            <Button type="submit" className="flex-1" disabled={loading || amountValue <= 0}>
              {loading ? "جارٍ الحفظ..." : "تأكيد الدفعة"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
