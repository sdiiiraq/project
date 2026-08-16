"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { upsertHelpGuideSchema, type UpsertHelpGuideInput } from "@/lib/validation/help";
import { upsertHelpGuide } from "@/lib/actions/help.actions";
import { HELP_PAGE_OPTIONS } from "@/lib/help-pages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export function HelpGuideFormDialog({ guide }: { guide?: UpsertHelpGuideInput }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<UpsertHelpGuideInput>({
    resolver: zodResolver(upsertHelpGuideSchema),
    defaultValues: guide ?? { pageKey: "", title: "", description: "", mobileVideoUrl: "", desktopVideoUrl: "", enabled: true },
  });

  async function onSubmit(values: UpsertHelpGuideInput) {
    setLoading(true);
    const result = await upsertHelpGuide(values);
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم حفظ الشرح");
    setOpen(false);
    if (!guide) reset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={guide ? "outline" : "default"} size={guide ? "sm" : "default"}>
          {guide ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {guide ? "تعديل" : "إضافة شرح"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{guide ? "تعديل الشرح" : "إضافة شرح جديد"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex max-h-[75svh] flex-col gap-4 overflow-y-auto">
          {guide?.id && <input type="hidden" {...register("id")} value={guide.id} />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">اسم الشرح</Label>
            <Input id="title" {...register("title")} />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>الصفحة المرتبطة</Label>
            <Controller
              control={control}
              name="pageKey"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الصفحة" />
                  </SelectTrigger>
                  <SelectContent>
                    {HELP_PAGE_OPTIONS.map((p) => (
                      <SelectItem key={p.key} value={p.key}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.pageKey && <p className="text-xs text-destructive">{errors.pageKey.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="description">وصف مختصر (اختياري)</Label>
            <Textarea id="description" rows={2} {...register("description")} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mobileVideoUrl">رابط يوتيوب — نسخة الجوال</Label>
            <Input id="mobileVideoUrl" dir="ltr" placeholder="https://youtube.com/watch?v=..." {...register("mobileVideoUrl")} />
            {errors.mobileVideoUrl && <p className="text-xs text-destructive">{errors.mobileVideoUrl.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desktopVideoUrl">رابط يوتيوب — نسخة الكمبيوتر</Label>
            <Input id="desktopVideoUrl" dir="ltr" placeholder="https://youtube.com/watch?v=..." {...register("desktopVideoUrl")} />
            {errors.desktopVideoUrl && <p className="text-xs text-destructive">{errors.desktopVideoUrl.message}</p>}
          </div>

          <Controller
            control={control}
            name="enabled"
            render={({ field }) => (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(Boolean(v))} />
                تفعيل الشرح (يظهر للمستخدمين فور الحفظ)
              </label>
            )}
          />

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
