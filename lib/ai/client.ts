import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AIContext } from "@/lib/domain/ai-context";
import { formatMoney } from "@/lib/utils/money";

export class AINotConfiguredError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY غير مُعرَّف.");
    this.name = "AINotConfiguredError";
  }
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

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    system: buildSystemPrompt(context),
    output_config: { effort: "medium" },
    messages: [
      ...history.map((m) => ({
        role: m.role === "USER" ? ("user" as const) : ("assistant" as const),
        content: m.content,
      })),
      { role: "user" as const, content: question },
    ],
  });

  if (response.stop_reason === "refusal") {
    return "تعذر الرد على هذا السؤال. حاول إعادة صياغته.";
  }

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "تعذر توليد رد.";
}
