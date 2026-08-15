"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="اكتب ردك هنا..." />
      <Button type="submit" className="self-end" disabled={loading || !body.trim()}>
        <Send className="h-4 w-4" /> {loading ? "جارٍ الإرسال..." : "إرسال"}
      </Button>
    </form>
  );
}
