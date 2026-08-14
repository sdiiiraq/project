"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { changeAmpereSchema, type ChangeAmpereInput } from "@/lib/validation/customer";
import { changeAmpere } from "@/lib/actions/customer.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { formatMoney } from "@/lib/utils/money";

export function ChangeAmpereDialog({
  customerId,
  amperePlans,
}: {
  customerId: string;
  amperePlans: { id: string; amperes: number; monthlyPrice: number }[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangeAmpereInput>({ resolver: zodResolver(changeAmpereSchema), defaultValues: { customerId } });

  async function onSubmit(values: ChangeAmpereInput) {
    setLoading(true);
    const result = await changeAmpere(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تغيير الأمبير");
    setOpen(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Zap className="h-4 w-4" /> تغيير الأمبير
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تغيير باقة الأمبير</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <input type="hidden" {...register("customerId")} value={customerId} />
          <div className="flex flex-col gap-1.5">
            <Label>الباقة الجديدة</Label>
            <Controller
              control={control}
              name="amperePlanId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الأمبير" />
                  </SelectTrigger>
                  <SelectContent>
                    {amperePlans.map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>
                        {plan.amperes} أمبير — {formatMoney(plan.monthlyPrice)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.amperePlanId && <p className="text-xs text-destructive">{errors.amperePlanId.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason">سبب التغيير (اختياري)</Label>
            <Input id="reason" {...register("reason")} />
          </div>
          <div className="flex gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "جارٍ الحفظ..." : "تأكيد التغيير"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
