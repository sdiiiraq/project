"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createExpenseSchema, type CreateExpenseInput } from "@/lib/validation/operations";
import { createExpense } from "@/lib/actions/expense.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export function CreateExpenseDialog({ categories }: { categories: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateExpenseInput>({
    resolver: zodResolver(createExpenseSchema),
    defaultValues: { date: new Date() },
  });

  async function onSubmit(values: CreateExpenseInput) {
    setLoading(true);
    const result = await createExpense(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تمت إضافة المصروف");
    setOpen(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> إضافة مصروف
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إضافة مصروف</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>التصنيف</Label>
            <Controller
              control={control}
              name="categoryId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر التصنيف" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.categoryId && <p className="text-xs text-destructive">{errors.categoryId.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="amount">المبلغ (د.ع)</Label>
            <Input id="amount" type="number" {...register("amount")} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="date">التاريخ</Label>
            <Input id="date" type="date" {...register("date")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor">على ماذا صرفت (اختياري)</Label>
            <Input id="vendor" {...register("vendor")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="note">ملاحظة (اختياري)</Label>
            <Input id="note" {...register("note")} />
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
