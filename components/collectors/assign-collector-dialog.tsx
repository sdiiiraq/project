"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { assignCollectorSchema, type AssignCollectorInput } from "@/lib/validation/operations";
import { assignCollector } from "@/lib/actions/collector.actions";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export function AssignCollectorDialog({
  collectors,
  customers,
}: {
  collectors: { userId: string; name: string }[];
  customers: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AssignCollectorInput>({ resolver: zodResolver(assignCollectorSchema) });

  async function onSubmit(values: AssignCollectorInput) {
    setLoading(true);
    const result = await assignCollector(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تعيين المشترك للجابي");
    setOpen(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={collectors.length === 0}>
          <UserPlus className="h-4 w-4" /> تعيين مشترك
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعيين مشترك لجابي</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>الجابي</Label>
            <Controller
              control={control}
              name="collectorUserId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الجابي" />
                  </SelectTrigger>
                  <SelectContent>
                    {collectors.map((c) => (
                      <SelectItem key={c.userId} value={c.userId}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.collectorUserId && <p className="text-xs text-destructive">{errors.collectorUserId.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>المشترك</Label>
            <Controller
              control={control}
              name="customerId"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر المشترك" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.customerId && <p className="text-xs text-destructive">{errors.customerId.message}</p>}
          </div>
          <div className="flex gap-3">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                إلغاء
              </Button>
            </DialogClose>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "جارٍ الحفظ..." : "تعيين"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
