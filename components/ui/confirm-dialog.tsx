"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "تأكيد الحذف",
  onConfirm,
  successMessage,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<{ error: string } | { success: true }>;
  successMessage: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    const result = await onConfirm();
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success(successMessage);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-3">
          <DialogClose asChild>
            <Button type="button" variant="outline" className="flex-1">
              إلغاء
            </Button>
          </DialogClose>
          <Button type="button" variant="destructive" className="flex-1" disabled={loading} onClick={handleConfirm}>
            {loading ? "جارٍ الحذف..." : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
