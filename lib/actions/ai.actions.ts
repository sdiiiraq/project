"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { canUseFeature } from "@/lib/rbac/features";
import { getAIContext } from "@/lib/domain/ai-context";
import { askAssistant, AINotConfiguredError } from "@/lib/ai/client";

export type AskAIResult = { error: string } | { success: true; conversationId: string; answer: string };

export async function askAI(input: { conversationId?: string; question: string }): Promise<AskAIResult> {
  const question = input.question.trim();
  if (!question) return { error: "أدخل سؤالًا." };

  const { workspace, user } = await requireWorkspace();

  const featureEnabled = await canUseFeature(workspace.id, "FEATURE_AI");
  if (!featureEnabled) {
    return { error: "المساعد الذكي غير مُفعّل ضمن باقتك الحالية." };
  }

  let conversation = input.conversationId
    ? await db.aIConversation.findFirst({ where: { id: input.conversationId, workspaceId: workspace.id, userId: user.id } })
    : null;

  if (!conversation) {
    conversation = await db.aIConversation.create({
      data: { workspaceId: workspace.id, userId: user.id, title: question.slice(0, 60) },
    });
  }

  const history = await db.aIMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  await db.aIMessage.create({ data: { conversationId: conversation.id, role: "USER", content: question } });

  let answer: string;
  try {
    const context = await getAIContext(workspace.id);
    answer = await askAssistant(
      context,
      history.map((m) => ({ role: m.role, content: m.content })),
      question,
    );
  } catch (error) {
    if (error instanceof AINotConfiguredError) {
      return { error: "المساعد الذكي غير مُهيَّأ بعد على هذا الخادم." };
    }
    console.error("AI assistant error:", error);
    return { error: "تعذر تنفيذ العملية. حاول مرة أخرى." };
  }

  await db.aIMessage.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: answer } });

  revalidatePath("/assistant");
  return { success: true, conversationId: conversation.id, answer };
}

export async function getOrCreateLatestConversation(workspaceId: string, userId: string) {
  return db.aIConversation.findFirst({
    where: { workspaceId, userId },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}
