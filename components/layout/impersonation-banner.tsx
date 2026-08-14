"use client";

import { Eye } from "lucide-react";
import { endImpersonation } from "@/lib/actions/impersonation.actions";

export function ImpersonationBanner({ workspaceName }: { workspaceName: string }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-warning px-4 py-2 text-sm font-medium text-warning-foreground">
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4" /> أنت تشاهد مولدة «{workspaceName}» بصفتك مشرف المنصة.
      </span>
      <form action={endImpersonation}>
        <button type="submit" className="rounded-md bg-black/10 px-3 py-1 hover:bg-black/20">
          إنهاء العرض
        </button>
      </form>
    </div>
  );
}
