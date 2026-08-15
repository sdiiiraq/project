"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { pricePerAmpereSchema, type PricePerAmpereInput } from "@/lib/validation/onboarding";
import { savePricePerAmpere } from "@/lib/actions/onboarding.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AmperePricingSettingsForm({
  initialNormalPrice,
  initialGoldPrice,
}: {
  initialNormalPrice: number;
  initialGoldPrice: number;
}) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PricePerAmpereInput>({
    resolver: zodResolver(pricePerAmpereSchema),
    defaultValues: {
      normalAmperePriceIQD: initialNormalPrice > 0 ? initialNormalPrice : undefined,
      goldAmperePriceIQD: initialGoldPrice > 0 ? initialGoldPrice : undefined,
    },
  });

  async function onSubmit(values: PricePerAmpereInput) {
    setLoading(true);
    const result = await savePricePerAmpere(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم حفظ الأسعار");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="normalAmperePriceIQD">سعر الأمبير العادي شهريًا (د.ع)</Label>
          <Input id="normalAmperePriceIQD" type="number" min={1} inputMode="numeric" {...register("normalAmperePriceIQD")} />
          {errors.normalAmperePriceIQD && <p className="text-xs text-destructive">{errors.normalAmperePriceIQD.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goldAmperePriceIQD">سعر الأمبير الذهبي شهريًا (د.ع)</Label>
          <Input id="goldAmperePriceIQD" type="number" min={1} inputMode="numeric" {...register("goldAmperePriceIQD")} />
          {errors.goldAmperePriceIQD && <p className="text-xs text-destructive">{errors.goldAmperePriceIQD.message}</p>}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        يُستخدم السعر المطابق لنوع اشتراك كل مشترك (عادي/ذهبي) لحساب قيمة اشتراكه تلقائيًا: عدد الأمبيرات × السعر.
        تغيير السعر هنا لا يُعيد احتساب الاشتراكات أو الديون السابقة.
      </p>
      <Button type="submit" disabled={loading} className="self-start">
        {loading ? "جارٍ الحفظ..." : "حفظ الأسعار"}
      </Button>
    </form>
  );
}
