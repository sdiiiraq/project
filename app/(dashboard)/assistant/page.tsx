import { requireWorkspace } from "@/lib/auth/session";
import { getOrCreateLatestConversation } from "@/lib/actions/ai.actions";
import { AssistantChat } from "@/components/assistant/chat";

export default async function AssistantPage() {
  const { workspace, user } = await requireWorkspace();
  const conversation = await getOrCreateLatestConversation(workspace.id, user.id);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-bold">المساعد الذكي</h1>
        <p className="text-sm text-muted-foreground">تحليل بيانات مولدتك فقط — لا ينفذ عمليات مالية</p>
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
