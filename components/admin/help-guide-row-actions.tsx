"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { toggleHelpGuide, deleteHelpGuide } from "@/lib/actions/help.actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DialogTrigger } from "@/components/ui/dialog";

export function HelpGuideStatusToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleHelpGuide({ id, enabled: !enabled });
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(enabled ? "تم تعطيل الشرح" : "تم تفعيل الشرح");
    });
  }

  return (
    <button type="button" onClick={handleToggle} disabled={pending} className="disabled:opacity-50">
      <Badge variant={enabled ? "success" : "secondary"}>{enabled ? "مفعّل" : "معطّل"}</Badge>
    </button>
  );
}

export function DeleteHelpGuideButton({ id, title }: { id: string; title: string }) {
  return (
    <ConfirmDialog
      trigger={
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" title="حذف" aria-label="حذف">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </DialogTrigger>
      }
      title="حذف الشرح؟"
      description={`سيتم حذف "${title}" نهائيًا ولن يظهر بعد الآن لأي مستخدم.`}
      onConfirm={() => deleteHelpGuide({ id })}
      successMessage="تم حذف الشرح"
    />
  );
}
