"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { generatorInfoSchema, type GeneratorInfoInput } from "@/lib/validation/onboarding";
import { updateGeneratorInfo } from "@/lib/actions/onboarding.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function GeneratorSettingsForm({ defaultValues }: { defaultValues: GeneratorInfoInput }) {
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GeneratorInfoInput>({ resolver: zodResolver(generatorInfoSchema), defaultValues });

  async function onSubmit(values: GeneratorInfoInput) {
    setLoading(true);
    const result = await updateGeneratorInfo(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم حفظ التغييرات");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ownerName">الاسم الثلاثي لصاحب المولدة</Label>
          <Input id="ownerName" placeholder="مثال: أحمد محمد علي" {...register("ownerName")} />
          {errors.ownerName && <p className="text-xs text-destructive">{errors.ownerName.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">الهاتف</Label>
          <Input id="phone" dir="ltr" {...register("phone")} />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="region">المنطقة</Label>
          <Input id="region" {...register("region")} />
          {errors.region && <p className="text-xs text-destructive">{errors.region.message}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="address">العنوان</Label>
          <Input id="address" {...register("address")} />
        </div>
      </div>
      <Button type="submit" className="self-start" disabled={loading}>
        {loading ? "جارٍ الحفظ..." : "حفظ التغييرات"}
      </Button>
    </form>
  );
}
