"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { updateCustomerSchema, type UpdateCustomerInput } from "@/lib/validation/customer";
import { updateCustomer } from "@/lib/actions/customer.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

const CUSTOMER_TYPE_OPTIONS = [
  { value: "NORMAL", label: "عادي" },
  { value: "RESIDENTIAL", label: "سكني" },
  { value: "COMMERCIAL", label: "تجاري" },
] as const;

export function EditCustomerDialog({ customer }: { customer: UpdateCustomerInput }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateCustomerInput>({ resolver: zodResolver(updateCustomerSchema), defaultValues: customer });

  async function onSubmit(values: UpdateCustomerInput) {
    setLoading(true);
    const result = await updateCustomer(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تحديث بيانات المشترك");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil className="h-4 w-4" /> تعديل
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل بيانات المشترك</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <input type="hidden" {...register("id")} value={customer.id} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-name">الاسم</Label>
            <Input id="edit-name" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-phone">الهاتف</Label>
            <Input id="edit-phone" dir="ltr" placeholder="07xxxxxxxxx" {...register("phone")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>نوع المشترك</Label>
            <Controller
              control={control}
              name="customerType"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر نوع المشترك" />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOMER_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-region">المنطقة</Label>
              <Input id="edit-region" {...register("region")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-neighborhood">المحلة</Label>
              <Input id="edit-neighborhood" {...register("neighborhood")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-alley">الزقاق</Label>
              <Input id="edit-alley" {...register("alley")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-houseNumber">رقم الدار</Label>
              <Input id="edit-houseNumber" {...register("houseNumber")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-notes">ملاحظات</Label>
            <Input id="edit-notes" {...register("notes")} />
          </div>
          <div className="flex gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "جارٍ الحفظ..." : "حفظ التعديلات"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
