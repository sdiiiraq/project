import { describe, it, expect, afterEach } from "vitest";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createCustomerWithSubscription, nextSubscriberNumber } from "@/lib/domain/billing";
import { createTestWorkspace, cleanupWorkspace, type TestWorkspace } from "./fixtures";

const created: TestWorkspace[] = [];

afterEach(async () => {
  while (created.length > 0) await cleanupWorkspace(created.pop()!);
});

async function makeWorkspace() {
  const ws = await createTestWorkspace();
  created.push(ws);
  return ws;
}

describe("اختبار A — 50 إضافة مشترك متزامنة لنفس المولدة", () => {
  it("ينتج 50 رقم مشترك مختلف بصفر أخطاء P2002", async () => {
    const ws = await makeWorkspace();

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, (_, i) =>
        createCustomerWithSubscription({
          workspaceId: ws.workspaceId,
          generatorId: ws.generatorId,
          actorUserId: ws.userId,
          name: `مشترك متزامن ${i + 1}`,
          amperes: 5,
          tier: "NORMAL",
          customerType: "NORMAL",
        }),
      ),
    );

    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    // صفر تعارض على القيد الفريد (subscriberNumber مكرر)
    const uniqueViolations = rejected.filter(
      (r) => r.reason instanceof Prisma.PrismaClientKnownRequestError && r.reason.code === "P2002",
    );
    expect(uniqueViolations).toHaveLength(0);

    // كل الخمسين نجحت
    expect(rejected.map((r) => String(r.reason))).toEqual([]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(50);

    // 50 رقمًا مختلفًا فعليًا في قاعدة البيانات
    const customers = await db.customer.findMany({
      where: { workspaceId: ws.workspaceId },
      select: { subscriberNumber: true },
    });
    expect(customers).toHaveLength(50);

    const numbers = customers.map((c) => c.subscriberNumber);
    expect(new Set(numbers).size).toBe(50);

    // متسلسلة 0001..0050 بلا فراغات (لا فشل ⇒ لا فراغ)
    expect([...numbers].sort()).toEqual(
      Array.from({ length: 50 }, (_, i) => String(i + 1).padStart(4, "0")),
    );
  });

  it("العدّاد ذرّي: 100 حجز متزامن يُنتج 100 قيمة فريدة", async () => {
    const ws = await makeWorkspace();

    const numbers = await Promise.all(
      Array.from({ length: 100 }, () => nextSubscriberNumber(db, ws.workspaceId)),
    );

    expect(new Set(numbers).size).toBe(100);

    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: ws.workspaceId },
      select: { subscriberSequence: true },
    });
    expect(workspace.subscriberSequence).toBe(100);
  });

  it("لا يُعيد استخدام أرقام المشتركين المحذوفين منطقيًا", async () => {
    const ws = await makeWorkspace();

    const first = await createCustomerWithSubscription({
      workspaceId: ws.workspaceId,
      generatorId: ws.generatorId,
      actorUserId: ws.userId,
      name: "مشترك أول",
      amperes: 5,
      tier: "NORMAL",
      customerType: "NORMAL",
    });
    expect(first.customer.subscriberNumber).toBe("0001");

    await db.customer.update({ where: { id: first.customer.id }, data: { deletedAt: new Date() } });

    const second = await createCustomerWithSubscription({
      workspaceId: ws.workspaceId,
      generatorId: ws.generatorId,
      actorUserId: ws.userId,
      name: "مشترك ثانٍ",
      amperes: 5,
      tier: "NORMAL",
      customerType: "NORMAL",
    });

    // الرقم يتقدم للأمام دائمًا — لا يُعاد استخدام 0001 بعد الحذف المنطقي.
    expect(second.customer.subscriberNumber).toBe("0002");
  });

  it("عدّادات المولدات مستقلة عن بعضها", async () => {
    const [a, b] = await Promise.all([makeWorkspace(), makeWorkspace()]);

    const [numbersA, numbersB] = await Promise.all([
      Promise.all(Array.from({ length: 10 }, () => nextSubscriberNumber(db, a.workspaceId))),
      Promise.all(Array.from({ length: 10 }, () => nextSubscriberNumber(db, b.workspaceId))),
    ]);

    expect([...numbersA].sort()).toEqual([...numbersB].sort());
    expect(new Set(numbersA).size).toBe(10);
    expect(new Set(numbersB).size).toBe(10);
  });
});
