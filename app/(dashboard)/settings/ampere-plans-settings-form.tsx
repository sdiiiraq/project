"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { amperePlansSchema, type AmperePlansInput } from "@/lib/validation/onboarding";
import { saveAmperePlans } from "@/lib/actions/onboarding.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AmperePlansSettingsForm({ initialPlans }: { initialPlans: { amperes: number; monthlyPrice: number }[] }) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AmperePlansInput>({
    resolver: zodResolver(amperePlansSchema),
    defaultValues: { plans: initialPlans.length > 0 ? initialPlans : [{ amperes: 5, monthlyPrice: 50000 }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "plans" });

  async function onSubmit(values: AmperePlansInput) {
    setLoading(true);
    const result = await saveAmperePlans(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم حفظ الأسعار");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>الأمبير</Label>
              <Input type="number" {...register(`plans.${index}.amperes` as const)} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>السعر الشهري (د.ع)</Label>
              <Input type="number" {...register(`plans.${index}.monthlyPrice` as const)} />
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)} disabled={fields.length === 1}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
      {errors.plans?.message && <p className="text-xs text-destructive">{errors.plans.message}</p>}
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => append({ amperes: 0, monthlyPrice: 0 })}>
          <Plus className="h-4 w-4" /> إضافة باقة
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "جارٍ الحفظ..." : "حفظ الأسعار"}
        </Button>
      </div>
    </form>
  );
}
