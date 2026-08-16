import { requireWorkspace } from "@/lib/auth/session";
import { getOrCreateLatestConversation } from "@/lib/actions/ai.actions";
import { AssistantChat } from "@/components/assistant/chat";
import { PageHelp } from "@/components/help/page-help";

export default async function AssistantPage() {
  const { workspace, user } = await requireWorkspace();
  const conversation = await getOrCreateLatestConversation(workspace.id, user.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">المساعد الذكي</h1>
          <p className="text-sm text-muted-foreground">تحليل بيانات مولدتك فقط — لا ينفذ عمليات مالية</p>
        </div>
        <PageHelp pageKey="assistant" />
      </div>

      <AssistantChat
        conversationId={conversation?.id ?? null}
        initialMessages={
          conversation?.messages.map((m) => ({ id: m.id, role: m.role, content: m.content })) ?? []
        }
      />
    </div>
  );
}
