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

export function AmperePricingSettingsForm({ initialPrice }: { initialPrice: number }) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PricePerAmpereInput>({
    resolver: zodResolver(pricePerAmpereSchema),
    defaultValues: { amperePriceIQD: initialPrice > 0 ? initialPrice : undefined },
  });

  async function onSubmit(values: PricePerAmpereInput) {
    setLoading(true);
    const result = await savePricePerAmpere(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم حفظ السعر");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex max-w-xs flex-col gap-1.5">
        <Label htmlFor="amperePriceIQD">سعر الأمبير الواحد شهريًا (د.ع)</Label>
        <Input id="amperePriceIQD" type="number" min={1} inputMode="numeric" {...register("amperePriceIQD")} />
        {errors.amperePriceIQD && <p className="text-xs text-destructive">{errors.amperePriceIQD.message}</p>}
        <p className="text-xs text-muted-foreground">
          يُستخدم هذا السعر لحساب اشتراك أي مشترك تلقائيًا: عدد الأمبيرات × هذا السعر.
        </p>
      </div>
      <Button type="submit" disabled={loading} className="self-start">
        {loading ? "جارٍ الحفظ..." : "حفظ السعر"}
      </Button>
    </form>
  );
}
