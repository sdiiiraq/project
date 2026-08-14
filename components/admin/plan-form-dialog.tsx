"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { upsertPlanSchema, type UpsertPlanInput } from "@/lib/validation/admin";
import { upsertPlan } from "@/lib/actions/admin.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export function PlanFormDialog({ plan }: { plan?: UpsertPlanInput }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpsertPlanInput>({ resolver: zodResolver(upsertPlanSchema), defaultValues: plan });

  async function onSubmit(values: UpsertPlanInput) {
    setLoading(true);
    const result = await upsertPlan(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم حفظ الباقة");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={plan ? "outline" : "default"} size={plan ? "sm" : "default"}>
          {plan ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {plan ? "تعديل" : "باقة جديدة"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{plan ? "تعديل الباقة" : "إنشاء باقة جديدة"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {plan?.id && <input type="hidden" {...register("id")} value={plan.id} />}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">الاسم</Label>
              <Input id="name" {...register("name")} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">المعرّف (slug)</Label>
              <Input id="slug" dir="ltr" {...register("slug")} />
              {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="price">السعر الشهري (د.ع)</Label>
            <Input id="price" type="number" {...register("price")} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="customerLimit">حد المشتركين</Label>
              <Input id="customerLimit" type="number" placeholder="بلا حد" {...register("customerLimit")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="userLimit">حد المستخدمين</Label>
              <Input id="userLimit" type="number" placeholder="بلا حد" {...register("userLimit")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="collectorLimit">حد الجباة</Label>
              <Input id="collectorLimit" type="number" placeholder="بلا حد" {...register("collectorLimit")} />
            </div>
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
