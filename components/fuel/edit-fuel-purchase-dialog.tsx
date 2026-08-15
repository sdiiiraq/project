"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { updateFuelPurchaseSchema, type UpdateFuelPurchaseInput } from "@/lib/validation/operations";
import { updateFuelPurchase, deleteFuelPurchase } from "@/lib/actions/fuel.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatMoney } from "@/lib/utils/money";

type FuelPurchaseRow = {
  id: string;
  quantityLiters: number;
  pricePerLiter: number;
  supplier: string | null;
  date: Date;
};

export function EditFuelPurchaseDialog({ purchase, canDelete }: { purchase: FuelPurchaseRow; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateFuelPurchaseInput>({
    resolver: zodResolver(updateFuelPurchaseSchema),
    defaultValues: {
      id: purchase.id,
      quantityLiters: purchase.quantityLiters,
      pricePerLiter: purchase.pricePerLiter,
      supplier: purchase.supplier ?? undefined,
      date: purchase.date,
    },
  });

  async function onSubmit(values: UpdateFuelPurchaseInput) {
    setLoading(true);
    const result = await updateFuelPurchase(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تحديث سجل الشراء");
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
            <DialogTitle>تعديل شراء وقود</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <input type="hidden" {...register("id")} value={purchase.id} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`quantityLiters-${purchase.id}`}>الكمية (لتر)</Label>
                <Input id={`quantityLiters-${purchase.id}`} type="number" step="0.01" {...register("quantityLiters")} />
                {errors.quantityLiters && <p className="text-xs text-destructive">{errors.quantityLiters.message}</p>}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`pricePerLiter-${purchase.id}`}>سعر اللتر (د.ع)</Label>
                <Input id={`pricePerLiter-${purchase.id}`} type="number" {...register("pricePerLiter")} />
                {errors.pricePerLiter && <p className="text-xs text-destructive">{errors.pricePerLiter.message}</p>}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`supplier-${purchase.id}`}>المورد (اختياري)</Label>
              <Input id={`supplier-${purchase.id}`} {...register("supplier")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`date-${purchase.id}`}>التاريخ</Label>
              <Input id={`date-${purchase.id}`} type="date" {...register("date")} />
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
          title="حذف سجل شراء الوقود"
          description={`سيتم حذف سجل شراء ${purchase.quantityLiters.toLocaleString("ar-IQ")} لتر بمبلغ ${formatMoney(purchase.quantityLiters * purchase.pricePerLiter)} نهائيًا، وسيقل مخزون الوقود المحسوب تبعًا لذلك. لا يمكن التراجع عن هذا الإجراء.`}
          onConfirm={() => deleteFuelPurchase({ id: purchase.id })}
          successMessage="تم حذف سجل الشراء"
        />
      )}
    </div>
  );
}
