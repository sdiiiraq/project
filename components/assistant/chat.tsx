"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { askAI } from "@/lib/actions/ai.actions";

type Message = { id: string; role: "USER" | "ASSISTANT"; content: string };

const SUGGESTED_QUESTIONS = [
  "كم ربحي هذا الشهر؟",
  "كم إجمالي الديون غير المحصلة؟",
  "من أكثر المشتركين تأخيرًا؟",
  "قارن هذا الشهر بالشهر الماضي",
];

export function AssistantChat({
  conversationId: initialConversationId,
  initialMessages,
}: {
  conversationId: string | null;
  initialMessages: Message[];
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendQuestion(question: string) {
    if (!question.trim() || loading) return;
    setError(null);
    setInput("");
    setMessages((prev) => [...prev, { id: `temp-${Date.now()}`, role: "USER", content: question }]);
    setLoading(true);

    const result = await askAI({ conversationId: conversationId ?? undefined, question });

    setLoading(false);
    if (result && "error" in result) {
      setError(result.error);
      return;
    }

    setConversationId(result.conversationId);
    setMessages((prev) => [...prev, { id: `resp-${Date.now()}`, role: "ASSISTANT", content: result.answer }]);
  }

  return (
    <div className="flex h-[calc(100svh-8rem)] flex-col lg:h-[calc(100svh-6rem)]">
      <div className="flex-1 overflow-y-auto rounded-xl border bg-card p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <Sparkles className="h-10 w-10 text-primary" />
            <div>
              <p className="font-medium">اسأل المساعد الذكي عن بيانات مولدتك</p>
              <p className="text-sm text-muted-foreground">مبني على بيانات هذه المولدة فقط</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendQuestion(q)}
                  className="rounded-full border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-2", m.role === "USER" && "flex-row-reverse")}>
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    m.role === "USER" ? "bg-secondary text-secondary-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  {m.role === "USER" ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </div>
                <div
                  className={cn(
                    "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
                    m.role === "USER" ? "bg-secondary text-secondary-foreground" : "bg-muted",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">جارٍ التفكير...</div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendQuestion(input);
        }}
        className="mt-3 flex gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="اكتب سؤالك هنا..."
          className="flex-1"
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
