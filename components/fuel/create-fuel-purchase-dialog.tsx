"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createFuelPurchaseSchema, type CreateFuelPurchaseInput } from "@/lib/validation/operations";
import { createFuelPurchase } from "@/lib/actions/fuel.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/utils/money";

export function CreateFuelPurchaseDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CreateFuelPurchaseInput>({ resolver: zodResolver(createFuelPurchaseSchema), defaultValues: { date: new Date() } });

  const quantityLiters = Number(watch("quantityLiters")) || 0;
  const pricePerLiter = Number(watch("pricePerLiter")) || 0;
  const totalCost = Math.round(quantityLiters * pricePerLiter);

  async function onSubmit(values: CreateFuelPurchaseInput) {
    setLoading(true);
    const result = await createFuelPurchase(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تسجيل شراء الوقود");
    setOpen(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> تسجيل شراء وقود
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>شراء وقود</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quantityLiters">الكمية (لتر)</Label>
              <Input id="quantityLiters" type="number" step="0.01" {...register("quantityLiters")} />
              {errors.quantityLiters && <p className="text-xs text-destructive">{errors.quantityLiters.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pricePerLiter">سعر اللتر (د.ع)</Label>
              <Input id="pricePerLiter" type="number" {...register("pricePerLiter")} />
              {errors.pricePerLiter && <p className="text-xs text-destructive">{errors.pricePerLiter.message}</p>}
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            الإجمالي: <span className="font-semibold">{formatMoney(totalCost)}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="supplier">المورد (اختياري)</Label>
            <Input id="supplier" {...register("supplier")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">التاريخ</Label>
            <Input id="date" type="date" {...register("date")} />
          </div>
          <div className="flex gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
