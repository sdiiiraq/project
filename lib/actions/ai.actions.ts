"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { canUseFeature } from "@/lib/rbac/features";
import { getAIContext } from "@/lib/domain/ai-context";
import { askAssistant, AINotConfiguredError, AIRequestError } from "@/lib/ai/client";
import { reserveAiRequest, releaseAiQuota } from "@/lib/domain/ai-usage";
import { log } from "@/lib/observability/logger";

export type AskAIResult = { error: string } | { success: true; conversationId: string; answer: string };

export async function askAI(input: { conversationId?: string; question: string }): Promise<AskAIResult> {
  const question = input.question.trim();
  if (!question) return { error: "أدخل سؤالًا." };

  const { workspace, user } = await requireWorkspace();

  const featureEnabled = await canUseFeature(workspace.id, "FEATURE_AI");
  if (!featureEnabled) {
    return { error: "المساعد الذكي غير مُفعّل ضمن باقتك الحالية." };
  }

  // بوابة الحماية: rate limit لكل workspace + حجز ذرّي من الحصة الشهرية للخطة.
  // تسبق أي كتابة أو أي استدعاء لـ Anthropic — الطلب المرفوض لا يصل إلى المزوّد إطلاقًا.
  //
  // تعذّر التحقق من الحد ⇒ نرفض (fail-closed) ولا نمرّر الطلب: تجاوز حدود الباقة أسوأ
  // من رفض مؤقت. لكن الرفض يخرج كرسالة عربية واضحة، لا كاستثناء يُسقط الصفحة.
  let quota;
  try {
    quota = await reserveAiRequest(workspace.id);
  } catch (error) {
    log.error("ai.quota_check_failed", { workspaceId: workspace.id, error });
    return { error: "تعذر التحقق من حدود الاستخدام حاليًا. حاول بعد قليل." };
  }
  if (!quota.allowed) return { error: quota.message };

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
    // الطلب لم ينجح ⇒ نُرجع الحجز حتى لا يُحتسب على حصة المشترك.
    await releaseAiQuota(workspace.id);

    if (error instanceof AINotConfiguredError) {
      return { error: "المساعد الذكي غير مُهيَّأ بعد على هذا الخادم." };
    }
    // خطأ مصنَّف من طبقة المزوّد ⇒ رسالة عربية دقيقة (مهلة/ضغط/تعذر وصول) بدل رسالة عامة.
    if (error instanceof AIRequestError) {
      log.warn("ai.action_failed", { workspaceId: workspace.id, reason: error.reason });
      return { error: error.message };
    }
    log.error("ai.action_failed", { workspaceId: workspace.id, error });
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
