"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { updateFuelUsageSchema, type UpdateFuelUsageInput } from "@/lib/validation/operations";
import { updateFuelUsage, deleteFuelUsage } from "@/lib/actions/fuel.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type FuelUsageRow = { id: string; quantityLiters: number; date: Date; note: string | null };

export function EditFuelUsageDialog({ usage, canDelete }: { usage: FuelUsageRow; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateFuelUsageInput>({
    resolver: zodResolver(updateFuelUsageSchema),
    defaultValues: { id: usage.id, quantityLiters: usage.quantityLiters, date: usage.date, note: usage.note ?? undefined },
  });

  async function onSubmit(values: UpdateFuelUsageInput) {
    setLoading(true);
    const result = await updateFuelUsage(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تحديث سجل الاستهلاك");
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-1">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="تعديل">
            <Pencil className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل استهلاك وقود</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <input type="hidden" {...register("id")} value={usage.id} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`usage-quantity-${usage.id}`}>الكمية المستهلكة (لتر)</Label>
              <Input id={`usage-quantity-${usage.id}`} type="number" step="0.01" {...register("quantityLiters")} />
              {errors.quantityLiters && <p className="text-xs text-destructive">{errors.quantityLiters.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`usage-date-${usage.id}`}>التاريخ</Label>
              <Input id={`usage-date-${usage.id}`} type="date" {...register("date")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`usage-note-${usage.id}`}>ملاحظة (اختياري)</Label>
              <Input id={`usage-note-${usage.id}`} {...register("note")} />
            </div>
            <div className="flex gap-3">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="flex-1">
                  إلغاء
                </Button>
              </DialogClose>
              <Button type="submit" className="flex-1" disabled={loading}>
                {loading ? "جارٍ الحفظ..." : "حفظ التعديل"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {canDelete && (
        <ConfirmDialog
          trigger={
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="حذف">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </DialogTrigger>
          }
          title="حذف سجل استهلاك الوقود"
          description={`سيتم حذف سجل استهلاك ${usage.quantityLiters.toLocaleString("ar-IQ")} لتر نهائيًا، وسيزيد مخزون الوقود المحسوب تبعًا لذلك. لا يمكن التراجع عن هذا الإجراء.`}
          onConfirm={() => deleteFuelUsage({ id: usage.id })}
          successMessage="تم حذف سجل الاستهلاك"
        />
      )}
    </div>
  );
}
