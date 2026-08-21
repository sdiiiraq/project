import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AIContext } from "@/lib/domain/ai-context";
import { formatMoney } from "@/lib/utils/money";
import { log } from "@/lib/observability/logger";

export class AINotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY غير مُعرَّف.");
    this.name = "AINotConfiguredError";
  }
}

/** سبب الفشل مصنّفًا — تستخدمه طبقة الأكشن لاختيار رسالة عربية دقيقة للمستخدم. */
export type AIFailureReason = "TIMEOUT" | "OVERLOADED" | "RATE_LIMITED" | "UPSTREAM" | "UNKNOWN";

export class AIRequestError extends Error {
  constructor(
    readonly reason: AIFailureReason,
    message: string,
  ) {
    super(message);
    this.name = "AIRequestError";
  }
}

const FAILURE_MESSAGES: Record<AIFailureReason, string> = {
  TIMEOUT: "المساعد الذكي استغرق وقتًا طويلًا. حاول مرة أخرى بسؤال أقصر.",
  OVERLOADED: "المساعد الذكي مشغول حاليًا. حاول بعد قليل.",
  RATE_LIMITED: "ضغط عالٍ على المساعد الذكي حاليًا. حاول بعد قليل.",
  UPSTREAM: "تعذر الوصول إلى المساعد الذكي حاليًا. حاول لاحقًا.",
  UNKNOWN: "تعذر تنفيذ العملية. حاول مرة أخرى.",
};

export function aiFailureMessage(reason: AIFailureReason): string {
  return FAILURE_MESSAGES[reason];
}

// مهلة صريحة لكل استدعاء — لا نعتمد على القيمة الافتراضية للـ SDK.
// تُضبط أقل من حد مدة تنفيذ Vercel حتى ينتهي الطلب برسالة خطأ واضحة بدل أن يُقطع.
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 20_000;

// إعادة المحاولة تُدار هنا صراحةً وليست متروكة للـ SDK (maxRetries: 0 أدناه)، حتى نتحكم
// بالضبط في: ما الذي يستحق إعادة المحاولة، وكم مرة، وبأي تباعد.
//
// يُعاد المحاولة على الأخطاء المؤقتة فقط: 408 / 409 / 429 / 5xx / انقطاع الشبكة.
// لا يُعاد المحاولة إطلاقًا على: أخطاء التحقق (400)، المصادقة (401)، الصلاحيات (403)،
// غير موجود (404)، أو تجاوز الحصة (402) — إعادتها هدر ولن تنجح.
//
// محاولة إضافية واحدة فقط: هذا استدعاء متزامن داخل Server Action، وكل محاولة إضافية
// تضاعف أسوأ زمن انتظار يراه المستخدم وتستهلك من مدة تنفيذ Vercel.
const AI_MAX_ATTEMPTS = 2;
const AI_RETRY_BASE_DELAY_MS = 500;

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function classify(error: unknown): { reason: AIFailureReason; retryable: boolean; status?: number } {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { reason: "TIMEOUT", retryable: true };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { reason: "UPSTREAM", retryable: true };
  }
  if (error instanceof Anthropic.APIError) {
    const status = error.status;
    if (status === 429) return { reason: "RATE_LIMITED", retryable: true, status };
    if (status === 529) return { reason: "OVERLOADED", retryable: true, status };
    if (typeof status === "number" && RETRYABLE_STATUS.has(status)) {
      return { reason: "UPSTREAM", retryable: true, status };
    }
    return { reason: "UPSTREAM", retryable: false, status };
  }
  return { reason: "UNKNOWN", retryable: false };
}

/** تباعد أسّي مع jitter — يمنع تزامن كل المحاولات المعادة على نفس اللحظة. */
function retryDelayMs(attempt: number): number {
  return AI_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let cachedClient: Anthropic | null = null;
let cachedKey: string | null = null;

function getClient(apiKey: string): Anthropic {
  if (cachedClient && cachedKey === apiKey) return cachedClient;
  // maxRetries: 0 — إعادة المحاولة يديرها هذا الملف صراحةً (انظر أعلاه).
  cachedClient = new Anthropic({ apiKey, timeout: AI_TIMEOUT_MS, maxRetries: 0 });
  cachedKey = apiKey;
  return cachedClient;
}

function buildSystemPrompt(context: AIContext): string {
  return [
    "أنت المساعد الذكي داخل منصة أمبير — منصة إدارة المولدات الأهلية في العراق.",
    "أجب فقط بالاستناد إلى البيانات المرفقة أدناه الخاصة بهذه المولدة تحديدًا. لا تخترع أرقامًا، ولا تفترض بيانات من مولدات أو مستخدمين آخرين.",
    "لا يمكنك تنفيذ أي عملية مالية (تسجيل دفعة، تعديل سعر، حذف مشترك) — أنت للتحليل والإجابة فقط. إذا طُلب منك تنفيذ عملية، وضّح أن ذلك يتم من داخل النظام مباشرة وليس عبر المحادثة.",
    "أجب بالعربية دائمًا، بإيجاز ووضوح، واعرض المبالغ المالية بصيغة عراقية مثل «150,000 د.ع».",
    "",
    `اسم المولدة: ${context.generatorName}`,
    `عدد المشتركين المتأخرين حاليًا: ${context.overdueCustomersCount}`,
    "",
    "بيانات الشهر الحالي:",
    `- المطلوب: ${formatMoney(context.currentMonth.due)}`,
    `- الدافع: ${formatMoney(context.currentMonth.collected)}`,
    `- المتبقي: ${formatMoney(context.currentMonth.outstanding)}`,
    `- المصروفات: ${formatMoney(context.currentMonth.expenses)}`,
    `- صافي الربح: ${formatMoney(context.currentMonth.netProfit)}`,
    `- كلفة الوقود: ${formatMoney(context.currentMonth.fuelCostIQD)} (${context.currentMonth.fuelPurchasedLiters} لتر)`,
    `- عدد المشتركين: ${context.currentMonth.customerCount}`,
    "",
    "بيانات الشهر الماضي (للمقارنة):",
    `- المطلوب: ${formatMoney(context.previousMonth.due)}`,
    `- الدافع: ${formatMoney(context.previousMonth.collected)}`,
    `- المصروفات: ${formatMoney(context.previousMonth.expenses)}`,
    `- صافي الربح: ${formatMoney(context.previousMonth.netProfit)}`,
    `- كلفة الوقود: ${formatMoney(context.previousMonth.fuelCostIQD)} (${context.previousMonth.fuelPurchasedLiters} لتر)`,
    "",
    `المخزون الحالي من الوقود: ${context.fuelCurrentStockLiters.toLocaleString("ar-IQ")} لتر`,
    "",
    "أكثر المشتركين تأخيرًا:",
    ...(context.topOverdueCustomers.length > 0
      ? context.topOverdueCustomers.map((c) => `- ${c.name}: ${formatMoney(c.outstandingIQD)}`)
      : ["- لا يوجد مشتركون متأخرون حاليًا"]),
  ].join("\n");
}

export async function askAssistant(
  context: AIContext,
  history: { role: "USER" | "ASSISTANT"; content: string }[],
  question: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AINotConfiguredError();

  const client = getClient(apiKey);

  const messages = [
    ...history.map((m) => ({
      role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: m.content,
    })),
    { role: "user" as const, content: question },
  ];

  const startedAt = Date.now();
  let lastReason: AIFailureReason = "UNKNOWN";

  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await client.messages.create({
        model: "claude-opus-5",
        max_tokens: 1024,
        system: buildSystemPrompt(context),
        output_config: { effort: "medium" },
        messages,
      });

      log.info("ai.request", {
        outcome: "success",
        attempt,
        durationMs: Date.now() - startedAt,
        stopReason: response.stop_reason,
      });

      if (response.stop_reason === "refusal") {
        return "تعذر الرد على هذا السؤال. حاول إعادة صياغته.";
      }

      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock && textBlock.type === "text" ? textBlock.text : "تعذر توليد رد.";
    } catch (error) {
      const { reason, retryable, status } = classify(error);
      lastReason = reason;

      const isLastAttempt = attempt === AI_MAX_ATTEMPTS;
      log.warn("ai.request", {
        outcome: "failure",
        attempt,
        durationMs: Date.now() - startedAt,
        reason,
        status,
        retrying: retryable && !isLastAttempt,
      });

      // غير قابل لإعادة المحاولة، أو نفدت المحاولات ⇒ نخرج بخطأ مصنَّف بدل إعادة المحاولة بلا جدوى.
      if (!retryable || isLastAttempt) break;

      await sleep(retryDelayMs(attempt));
    }
  }

  throw new AIRequestError(lastReason, aiFailureMessage(lastReason));
}
