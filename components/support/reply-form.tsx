"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { replyTicket } from "@/lib/actions/support.actions";

export function ReplyForm({ ticketId }: { ticketId: string }) {
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    const result = await replyTicket({ ticketId, body });
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
      <Button type="submit" className="self-end" disabled={loading || !body.trim()}>
        <Send className="h-4 w-4" /> {loading ? "جارٍ الإرسال..." : "إرسال"}
      </Button>
    </form>
  );
}
