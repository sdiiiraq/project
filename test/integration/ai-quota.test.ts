import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { monthRange } from "@/lib/domain/billing";
import { reserveAiRequest, releaseAiQuota, AI_USAGE_METRIC } from "@/lib/domain/ai-usage";

import { createTestWorkspace, attachPlan, cleanupWorkspace, type TestWorkspace } from "./fixtures";

const created: TestWorkspace[] = [];

afterEach(async () => {
  while (created.length > 0) await cleanupWorkspace(created.pop()!);
});

async function workspaceWithLimit(aiRequestLimit: number | null) {
  const ws = await createTestWorkspace();
  created.push(ws);
  await attachPlan(ws.workspaceId, { aiRequestLimit });
  return ws;
}

async function currentUsage(workspaceId: string): Promise<number> {
  const now = new Date();
  const { periodStart, periodEnd } = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const record = await db.usage.findUnique({
    where: {
      workspaceId_metric_periodStart_periodEnd: {
        workspaceId,
        metric: AI_USAGE_METRIC,
        periodStart,
        periodEnd,
      },
    },
  });
  return record?.value ?? 0;
}

// الـ rate limit المطبَّق هو 10 طلبات/دقيقة لكل workspace. لاختبار الحصة الشهرية وحدها
// نوزّع الطلبات على workspaces متعددة أو نتحقق من الـ rate limit صراحة.
describe("اختبار B — حد استخدام الذكاء الاصطناعي", () => {
  it("يرفض الطلب فور تجاوز الحد الشهري، ولا يُحتسب الطلب المرفوض", async () => {
    const ws = await workspaceWithLimit(3);

    const first = await reserveAiRequest(ws.workspaceId);
    const second = await reserveAiRequest(ws.workspaceId);
    const third = await reserveAiRequest(ws.workspaceId);
    const fourth = await reserveAiRequest(ws.workspaceId);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(true);
    expect(fourth.allowed).toBe(false);
    if (!fourth.allowed) {
      expect(fourth.reason).toBe("QUOTA");
      expect(fourth.message).toContain("الحد المسموح");
    }

    // الطلب المرفوض لا يزيد العدّاد — الحد يبقى 3 بالضبط.
    expect(await currentUsage(ws.workspaceId)).toBe(3);
  });

  it("طلبات متزامنة عند الحد لا تتجاوزه إطلاقًا", async () => {
    const LIMIT = 8; // أقل من حد الـ rate limit (10/دقيقة) حتى يكون الرفض بسبب الحصة
    const ws = await workspaceWithLimit(LIMIT);

    const results = await Promise.all(
      Array.from({ length: 10 }, () => reserveAiRequest(ws.workspaceId)),
    );

    const allowed = results.filter((r) => r.allowed).length;
    expect(allowed).toBe(LIMIT);
    expect(await currentUsage(ws.workspaceId)).toBe(LIMIT);
  });

  it("100 طلب متزامن موزّعة على عدة workspaces لا تتجاوز حد أي منها", async () => {
    const LIMIT = 5;
    const workspaces = await Promise.all([
      workspaceWithLimit(LIMIT),
      workspaceWithLimit(LIMIT),
      workspaceWithLimit(LIMIT),
      workspaceWithLimit(LIMIT),
    ]);

    // 25 طلبًا متزامنًا لكل workspace = 100 طلب إجمالًا.
    const calls = workspaces.flatMap((ws) =>
      Array.from({ length: 25 }, () => reserveAiRequest(ws.workspaceId).then((r) => ({ ws, r }))),
    );
    const results = await Promise.all(calls);

    for (const ws of workspaces) {
      const allowed = results.filter((x) => x.ws.workspaceId === ws.workspaceId && x.r.allowed).length;
      // الحد الأدنى بين حد الحصة وحد الـ rate limit هو ما يُطبَّق فعليًا.
      expect(allowed).toBeLessThanOrEqual(LIMIT);
      expect(await currentUsage(ws.workspaceId)).toBe(allowed);
    }

    const totalAllowed = results.filter((x) => x.r.allowed).length;
    expect(totalAllowed).toBeLessThanOrEqual(LIMIT * workspaces.length);
  });

  it("الـ rate limit يرفض الانفجار المفاجئ حتى مع حصة شهرية مفتوحة", async () => {
    const ws = await workspaceWithLimit(null); // بلا حد شهري

    // هذا الاختبار وحده يخفض حدّ الدقيقة ليختبره فعليًا (البقية ترفعه لعزل الحصة).
    const previous = process.env.AI_RATE_LIMIT_PER_MINUTE;
    process.env.AI_RATE_LIMIT_PER_MINUTE = "10";

    let results;
    try {
      results = await Promise.all(
        Array.from({ length: 25 }, () => reserveAiRequest(ws.workspaceId)),
      );
    } finally {
      process.env.AI_RATE_LIMIT_PER_MINUTE = previous;
    }

    const allowed = results.filter((r) => r.allowed).length;
    const rateLimited = results.filter((r) => !r.allowed && r.reason === "RATE_LIMIT").length;

    // النافذة ثابتة بالدقيقة، وقد تعبر دفعة الطلبات حدّ دقيقة فتقع على نافذتين —
    // لذلك نتحقق من أن الحد يقصّ الانفجار فعلًا، لا من رقم واحد بعينه.
    expect(allowed).toBeGreaterThanOrEqual(10); // نافذة واحدة على الأقل
    expect(allowed).toBeLessThanOrEqual(20); // نافذتان كحد أقصى
    expect(rateLimited).toBe(25 - allowed);
    expect(rateLimited).toBeGreaterThan(0);
  });

  it("إرجاع الحجز عند فشل الاستدعاء يُنقص العدّاد", async () => {
    const ws = await workspaceWithLimit(5);

    await reserveAiRequest(ws.workspaceId);
    await reserveAiRequest(ws.workspaceId);
    expect(await currentUsage(ws.workspaceId)).toBe(2);

    await releaseAiQuota(ws.workspaceId);
    expect(await currentUsage(ws.workspaceId)).toBe(1);
  });

  it("حد صفري يرفض كل الطلبات", async () => {
    const ws = await workspaceWithLimit(0);

    const result = await reserveAiRequest(ws.workspaceId);
    expect(result.allowed).toBe(false);
    expect(await currentUsage(ws.workspaceId)).toBe(0);
  });
});

// ============================================================
// اختبار C بالمواصفة المطلوبة حرفيًا: الحد 100، الاستهلاك يبدأ من 90،
// ثم 50 طلبًا متزامنًا ⇒ 10 مسموحة بالضبط و40 مرفوضة.
//
// الـ rate limit يُرفع هنا عمدًا (عبر AI_RATE_LIMIT_PER_MINUTE في vitest.integration.config.ts)
// حتى يكون الرفض بسبب الحصة الشهرية وحدها، لا بسبب حدّ الدقيقة.
// ============================================================
describe("اختبار C — 50 طلبًا متزامنًا عند الحد 100 بعد استهلاك 90", () => {
  it("يسمح بعشرة بالضبط ويرفض أربعين، ولا يتجاوز الاستخدام 100 إطلاقًا", async () => {
    const LIMIT = 100;
    const PRE_CONSUMED = 90;
    const BURST = 50;

    const ws = await workspaceWithLimit(LIMIT);

    // تهيئة العدّاد على 90 مباشرةً — نفس السجل الذي يستخدمه المسار الحقيقي.
    const now = new Date();
    const { periodStart, periodEnd } = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
    await db.usage.create({
      data: {
        workspaceId: ws.workspaceId,
        metric: AI_USAGE_METRIC,
        value: PRE_CONSUMED,
        periodStart,
        periodEnd,
      },
    });
    expect(await currentUsage(ws.workspaceId)).toBe(PRE_CONSUMED);

    const results = await Promise.all(
      Array.from({ length: BURST }, () => reserveAiRequest(ws.workspaceId)),
    );

    const allowed = results.filter((r) => r.allowed);
    const denied = results.filter((r) => !r.allowed);

    expect(allowed).toHaveLength(LIMIT - PRE_CONSUMED); // 10 بالضبط
    expect(denied).toHaveLength(BURST - (LIMIT - PRE_CONSUMED)); // 40 بالضبط

    // كل الرفض بسبب الحصة، لا بسبب الـ rate limit.
    expect(denied.every((r) => !r.allowed && r.reason === "QUOTA")).toBe(true);

    // الاستخدام توقف عند الحد بالضبط — لا تجاوز ولو بواحد.
    expect(await currentUsage(ws.workspaceId)).toBe(LIMIT);
  });

  it("طلب إضافي بعد بلوغ الحد يُرفض ولا يزيد العدّاد", async () => {
    const ws = await workspaceWithLimit(100);
    const now = new Date();
    const { periodStart, periodEnd } = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
    await db.usage.create({
      data: { workspaceId: ws.workspaceId, metric: AI_USAGE_METRIC, value: 100, periodStart, periodEnd },
    });

    const result = await reserveAiRequest(ws.workspaceId);
    expect(result.allowed).toBe(false);
    expect(await currentUsage(ws.workspaceId)).toBe(100);
  });
});
