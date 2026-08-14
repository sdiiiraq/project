"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Fuel } from "lucide-react";
import { createFuelUsageSchema, type CreateFuelUsageInput } from "@/lib/validation/operations";
import { createFuelUsage } from "@/lib/actions/fuel.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export function CreateFuelUsageDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateFuelUsageInput>({ resolver: zodResolver(createFuelUsageSchema), defaultValues: { date: new Date() } });

  async function onSubmit(values: CreateFuelUsageInput) {
    setLoading(true);
    const result = await createFuelUsage(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تسجيل الاستهلاك");
    setOpen(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Fuel className="h-4 w-4" /> تسجيل استهلاك
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسجيل استهلاك وقود</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="quantityLiters">الكمية المستهلكة (لتر)</Label>
            <Input id="quantityLiters" type="number" step="0.01" {...register("quantityLiters")} />
            {errors.quantityLiters && <p className="text-xs text-destructive">{errors.quantityLiters.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">التاريخ</Label>
            <Input id="date" type="date" {...register("date")} />
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
              {loading ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
