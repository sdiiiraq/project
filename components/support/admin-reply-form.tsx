"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { adminReplyTicket } from "@/lib/actions/admin-support.actions";

export function AdminReplyForm({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState("");
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    const result = await adminReplyTicket({ ticketId, body, isInternalNote });
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    setBody("");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="اكتب ردك هنا..."
        className="flex w-full rounded-lg border border-input bg-background px-3.5 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={isInternalNote} onCheckedChange={(v) => setIsInternalNote(v === true)} />
          ملاحظة داخلية (لا تظهر للمستخدم)
        </label>
        <Button type="submit" disabled={loading || !body.trim()}>
          <Send className="h-4 w-4" /> {loading ? "جارٍ الإرسال..." : "إرسال"}
        </Button>
      </div>
    </form>
  );
}
