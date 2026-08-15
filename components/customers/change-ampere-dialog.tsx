"use client";

import { useState } from "react";
import { useForm, useWatch, Controller } from "react-hook-form";
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
  currentAmperes,
  currentTier,
  normalPrice,
  goldPrice,
}: {
  customerId: string;
  currentAmperes: number;
  currentTier: "NORMAL" | "GOLD";
  normalPrice: number;
  goldPrice: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangeAmpereInput>({
    resolver: zodResolver(changeAmpereSchema),
    defaultValues: { customerId, amperes: currentAmperes, tier: currentTier },
  });

  const amperesValue = useWatch({ control, name: "amperes" });
  const tierValue = useWatch({ control, name: "tier" });
  const pricePerAmpere = tierValue === "GOLD" ? goldPrice : normalPrice;
  const computedPrice = Number(amperesValue) > 0 ? Number(amperesValue) * pricePerAmpere : 0;
  const canSubmit = pricePerAmpere > 0;

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
          <DialogTitle>تغيير عدد الأمبيرات</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <input type="hidden" {...register("customerId")} value={customerId} />
          <div className="flex flex-col gap-1.5">
            <Label>نوع الاشتراك</Label>
            <Controller
              control={control}
              name="tier"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر نوع الاشتراك" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">عادي</SelectItem>
                    <SelectItem value="GOLD">ذهبي</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amperes">عدد الأمبيرات الجديد</Label>
            <Input id="amperes" type="number" min={1} inputMode="numeric" {...register("amperes")} />
            {errors.amperes && <p className="text-xs text-destructive">{errors.amperes.message}</p>}
            <p className="text-xs text-muted-foreground">
              السعر الشهري الجديد:{" "}
              <span className="font-medium text-foreground">
                {computedPrice > 0 ? formatMoney(computedPrice) : "—"}
              </span>
            </p>
            {!canSubmit && (
              <p className="text-xs text-warning">
                لم يتم تحديد سعر الأمبير {tierValue === "GOLD" ? "الذهبي" : "العادي"} بعد.
              </p>
            )}
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
            <Button type="submit" className="flex-1" disabled={loading || !canSubmit}>
              {loading ? "جارٍ الحفظ..." : "تأكيد التغيير"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
