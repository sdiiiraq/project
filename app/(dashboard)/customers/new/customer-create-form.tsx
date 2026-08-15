"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createCustomerSchema, type CreateCustomerInput } from "@/lib/validation/customer";
import { createCustomer } from "@/lib/actions/customer.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/utils/money";

export function CustomerCreateForm({ pricePerAmpere }: { pricePerAmpere: number }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateCustomerInput>({ resolver: zodResolver(createCustomerSchema) });

  const amperesValue = useWatch({ control, name: "amperes" });
  const computedPrice = Number(amperesValue) > 0 ? Number(amperesValue) * pricePerAmpere : 0;

  async function onSubmit(values: CreateCustomerInput) {
    setLoading(true);
    const result = await createCustomer(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تمت إضافة المشترك بنجاح");
    router.push(`/customers/${result.customerId}`);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">اسم المشترك</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">الهاتف</Label>
        <Input id="phone" dir="ltr" placeholder="07xxxxxxxxx" {...register("phone")} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="amperes">عدد الأمبيرات</Label>
        <Input id="amperes" type="number" min={1} inputMode="numeric" {...register("amperes")} />
        {errors.amperes && <p className="text-xs text-destructive">{errors.amperes.message}</p>}
        <p className="text-xs text-muted-foreground">
          السعر الشهري:{" "}
          <span className="font-medium text-foreground">{computedPrice > 0 ? formatMoney(computedPrice) : "—"}</span>
          {" "}(بسعر {formatMoney(pricePerAmpere)} لكل أمبير)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="region">المنطقة</Label>
          <Input id="region" {...register("region")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="neighborhood">المحلة</Label>
          <Input id="neighborhood" {...register("neighborhood")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alley">الزقاق</Label>
          <Input id="alley" {...register("alley")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="houseNumber">رقم الدار</Label>
          <Input id="houseNumber" {...register("houseNumber")} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notes">ملاحظات</Label>
        <Input id="notes" {...register("notes")} />
      </div>

      <Button type="submit" size="lg" disabled={loading || pricePerAmpere <= 0}>
        {loading ? "جارٍ الحفظ..." : "إضافة المشترك"}
      </Button>
    </form>
  );
}
