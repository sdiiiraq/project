"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { createMaintenanceSchema, type CreateMaintenanceInput } from "@/lib/validation/operations";
import { createMaintenanceRecord } from "@/lib/actions/maintenance.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export function CreateMaintenanceDialog({ equipment }: { equipment: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateMaintenanceInput>({
    resolver: zodResolver(createMaintenanceSchema),
    defaultValues: { date: new Date(), cost: 0 },
  });

  async function onSubmit(values: CreateMaintenanceInput) {
    setLoading(true);
    const result = await createMaintenanceRecord(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تسجيل الصيانة");
    setOpen(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={equipment.length === 0}>
          <Plus className="h-4 w-4" /> تسجيل صيانة
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسجيل صيانة</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>المعدة</Label>
            <Controller
              control={control}
              name="equipmentId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المعدة" />
                  </SelectTrigger>
                  <SelectContent>
                    {equipment.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.equipmentId && <p className="text-xs text-destructive">{errors.equipmentId.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">نوع الصيانة</Label>
            <Input id="type" {...register("type")} />
            {errors.type && <p className="text-xs text-destructive">{errors.type.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="date">التاريخ</Label>
              <Input id="date" type="date" {...register("date")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cost">التكلفة (د.ع)</Label>
              <Input id="cost" type="number" {...register("cost")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="technician">الفني (اختياري)</Label>
            <Input id="technician" {...register("technician")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nextMaintenanceDate">الصيانة القادمة (اختياري)</Label>
            <Input id="nextMaintenanceDate" type="date" {...register("nextMaintenanceDate")} />
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
