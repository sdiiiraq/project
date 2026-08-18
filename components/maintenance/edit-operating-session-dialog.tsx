"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { updateOperatingSessionSchema, type UpdateOperatingSessionInput } from "@/lib/validation/operations";
import { updateOperatingSession } from "@/lib/actions/operations.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

type OperatingSessionRow = {
  id: string;
  startTime: Date;
  endTime: Date;
  downtimeMinutes: number;
  downtimeReason: string | null;
};

function toLocalInputValue(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export function EditOperatingSessionDialog({ session }: { session: OperatingSessionRow }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateOperatingSessionInput>({
    resolver: zodResolver(updateOperatingSessionSchema),
    defaultValues: {
      sessionId: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      downtimeMinutes: session.downtimeMinutes,
      downtimeReason: session.downtimeReason ?? undefined,
    },
  });

  async function onSubmit(values: UpdateOperatingSessionInput) {
    setLoading(true);
    const result = await updateOperatingSession(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم تحديث جلسة التشغيل");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="تعديل">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل جلسة تشغيل</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <input type="hidden" {...register("sessionId")} value={session.id} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`startTime-${session.id}`}>وقت البدء</Label>
              <Input
                id={`startTime-${session.id}`}
                type="datetime-local"
                defaultValue={toLocalInputValue(session.startTime)}
                {...register("startTime")}
              />
              {errors.startTime && <p className="text-xs text-destructive">{errors.startTime.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`endTime-${session.id}`}>وقت الانتهاء</Label>
              <Input
                id={`endTime-${session.id}`}
                type="datetime-local"
                defaultValue={toLocalInputValue(session.endTime)}
                {...register("endTime")}
              />
              {errors.endTime && <p className="text-xs text-destructive">{errors.endTime.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`downtimeMinutes-${session.id}`}>مدة التوقف (دقيقة)</Label>
            <Input id={`downtimeMinutes-${session.id}`} type="number" min={0} {...register("downtimeMinutes")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`downtimeReason-${session.id}`}>سبب التوقف (اختياري)</Label>
            <Input id={`downtimeReason-${session.id}`} {...register("downtimeReason")} />
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
  );
}
