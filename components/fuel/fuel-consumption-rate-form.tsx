"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { updateFuelConsumptionRateSchema, type UpdateFuelConsumptionRateInput } from "@/lib/validation/operations";
import { updateFuelConsumptionRate } from "@/lib/actions/fuel.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FuelConsumptionRateForm({ currentRate }: { currentRate: number | null }) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateFuelConsumptionRateInput>({
    resolver: zodResolver(updateFuelConsumptionRateSchema),
    defaultValues: { fuelConsumptionPerHour: currentRate ?? undefined },
  });

  async function onSubmit(values: UpdateFuelConsumptionRateInput) {
    setLoading(true);
    const result = await updateFuelConsumptionRate(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم حفظ معدل استهلاك المولدة");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fuelConsumptionPerHour">استهلاك المولد في الساعة (لتر/ساعة)</Label>
        <Input
          id="fuelConsumptionPerHour"
          type="number"
          step="0.01"
          className="w-40"
          {...register("fuelConsumptionPerHour")}
        />
        {errors.fuelConsumptionPerHour && <p className="text-xs text-destructive">{errors.fuelConsumptionPerHour.message}</p>}
      </div>
      <Button type="submit" disabled={loading}>
        {loading ? "جارٍ الحفظ..." : "حفظ"}
      </Button>
    </form>
  );
}
