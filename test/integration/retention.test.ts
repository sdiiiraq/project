import { describe, it, expect, afterEach } from "vitest";
import { db } from "@/lib/db";
import { pruneCronRuns, pruneCompletedBillingJobs, pruneReadNotifications } from "@/lib/domain/retention";
import { createTestWorkspace, cleanupWorkspace, type TestWorkspace } from "./fixtures";

const created: TestWorkspace[] = [];
const DAY = 24 * 60 * 60 * 1000;

afterEach(async () => {
  await db.cronRun.deleteMany({});
  while (created.length > 0) await cleanupWorkspace(created.pop()!);
});

async function makeWorkspace() {
  const ws = await createTestWorkspace();
  created.push(ws);
  return ws;
}

describe("سياسة الاحتفاظ", () => {
  it("تحذف سجلات التشغيل القديمة وتُبقي الحديثة والفاشلة", async () => {
    const old = new Date(Date.now() - 200 * DAY);
    await db.cronRun.createMany({
      data: [
        { job: "billing-worker", status: "SUCCESS", startedAt: old },
        { job: "billing-worker", status: "FAILED", startedAt: old, error: "سبب" },
        { job: "billing-worker", status: "SUCCESS", startedAt: new Date() },
      ],
    });

    const deleted = await pruneCronRuns();
    expect(deleted).toBe(1);

    const remaining = await db.cronRun.findMany({ select: { status: true } });
    expect(remaining).toHaveLength(2);
    // الفاشل يبقى مهما قدم — هو دليل العطل الوحيد.
    expect(remaining.some((r) => r.status === "FAILED")).toBe(true);
  });

  it("تحذف أعمال الفوترة المكتملة القديمة وتُبقي الفاشلة بلا حد", async () => {
    const ws = await makeWorkspace();
    const old = new Date(Date.now() - 200 * DAY);

    await db.billingJob.createMany({
      data: [
        { workspaceId: ws.workspaceId, cycle: "2020-01", status: "DONE", completedAt: old },
        { workspaceId: ws.workspaceId, cycle: "2020-02", status: "FAILED", failedAt: old, error: "سبب" },
        { workspaceId: ws.workspaceId, cycle: "2020-03", status: "DONE", completedAt: new Date() },
      ],
    });

    const deleted = await pruneCompletedBillingJobs();
    expect(deleted).toBe(1);

    const remaining = await db.billingJob.findMany({
      where: { workspaceId: ws.workspaceId },
      select: { cycle: true, status: true },
    });
    expect(remaining).toHaveLength(2);
    expect(remaining.some((j) => j.status === "FAILED")).toBe(true);
    expect(remaining.some((j) => j.cycle === "2020-01")).toBe(false);
  });

  it("تحذف الإشعارات المقروءة القديمة فقط — غير المقروءة تبقى دائمًا", async () => {
    const ws = await makeWorkspace();
    const old = new Date(Date.now() - 200 * DAY);

    await db.notification.createMany({
      data: [
        { workspaceId: ws.workspaceId, type: "SYSTEM", title: "مقروء قديم", body: "x", readAt: old, createdAt: old },
        { workspaceId: ws.workspaceId, type: "SYSTEM", title: "غير مقروء قديم", body: "x", createdAt: old },
        { workspaceId: ws.workspaceId, type: "SYSTEM", title: "مقروء حديث", body: "x", readAt: new Date() },
      ],
    });

    const deleted = await pruneReadNotifications();
    expect(deleted).toBe(1);

    const remaining = await db.notification.findMany({
      where: { workspaceId: ws.workspaceId },
      select: { title: true },
    });
    expect(remaining.map((n) => n.title).sort()).toEqual(["غير مقروء قديم", "مقروء حديث"]);
  });

  it("لا تمس سجل التدقيق إطلاقًا", async () => {
    const ws = await makeWorkspace();
    const old = new Date(Date.now() - 2000 * DAY);
    await db.auditLog.create({
      data: { workspaceId: ws.workspaceId, action: "customer.create", entity: "Customer", createdAt: old },
    });

    await Promise.all([pruneCronRuns(), pruneCompletedBillingJobs(), pruneReadNotifications()]);

    expect(await db.auditLog.count({ where: { workspaceId: ws.workspaceId } })).toBe(1);
  });
});
