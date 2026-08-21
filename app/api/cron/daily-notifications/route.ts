import { type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runCronJob } from "@/lib/cron/run";
import { pruneAiRateLimitBuckets } from "@/lib/domain/ai-usage";
import { pruneRateLimitBuckets } from "@/lib/domain/rate-limit";
import { runRetention } from "@/lib/domain/retention";
import type { Prisma } from "@prisma/client";

export const maxDuration = 60;

// Vercel Cron يومي — يبني تنبيهات من بيانات حقيقية فقط: مشتركون متأخرون، مواعيد صيانة مستحقة، مخزون وقود منخفض.
//
// أُعيدت كتابته ليعمل على مستوى المنصّة بدل حلقة لكل workspace:
//   • كان: لكل workspace ⇒ 3 استعلامات + إنشاء إشعار واحدًا تلو الآخر، وقراءة كل الفواتير
//     غير المدفوعة في تاريخ المولدة كاملًا بلا أي حد زمني (ينمو أبديًا).
//   • صار: استعلامات مُجمَّعة (groupBy/aggregate) على مستوى قاعدة البيانات، وكتابة الإشعارات
//     بـ createMany على دفعات. عدد الاستعلامات ثابت تقريبًا مهما بلغ عدد المولدات.
const OVERDUE_CHECKPOINTS = [1, 3, 5, 7, 14, 30] as const;
const OVERDUE_CHECKPOINT_SET = new Set<number>(OVERDUE_CHECKPOINTS);
const LOW_FUEL_THRESHOLD_LITERS = 50;

const CHUNK = 1_000;
const DAY_MS = 1000 * 60 * 60 * 24;

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** كتابة الإشعارات على دفعات — لا INSERT منفصل لكل إشعار. */
async function insertNotifications(rows: Prisma.NotificationCreateManyInput[]): Promise<number> {
  let written = 0;
  for (const batch of chunked(rows, CHUNK)) {
    const result = await db.notification.createMany({ data: batch });
    written += result.count;
  }
  return written;
}

export async function GET(request: NextRequest) {
  return runCronJob("daily-notifications", request, async () => {
    const now = new Date();
    const notifications: Prisma.NotificationCreateManyInput[] = [];

    // ---------------------------------------------------------------
    // 1) مشتركون متأخرون — نُنبّه فقط عند نقاط تحقق محددة (1/3/5/7/14/30 يوم).
    //
    // نأخذ أقدم فاتورة مفتوحة لكل مشترك عبر groupBy + _min في قاعدة البيانات، مع having
    // يحصر النتيجة بمن تقع أقدم فاتورته داخل نافذة نقاط التحقق. هذا يعطي نفس نتيجة الكود
    // السابق (أقدم فاتورة لكل مشترك) دون تحميل أي فاتورة إلى الذاكرة.
    // ---------------------------------------------------------------
    const oldestCheckpoint = Math.max(...OVERDUE_CHECKPOINTS);
    const windowFrom = new Date(now.getTime() - (oldestCheckpoint + 1) * DAY_MS);
    const windowTo = new Date(now.getTime() - 1 * DAY_MS);

    const overdueGroups = await db.invoice.groupBy({
      by: ["customerId", "workspaceId"],
      where: {
        status: { in: ["UNPAID", "PARTIALLY_PAID", "OVERDUE"] },
        customer: { deletedAt: null },
        workspace: { status: "ACTIVE" },
      },
      _min: { periodEnd: true },
      having: { periodEnd: { _min: { gte: windowFrom, lte: windowTo } } },
    });

    const dueForNotice = overdueGroups
      .map((group) => ({
        customerId: group.customerId,
        workspaceId: group.workspaceId,
        daysOverdue: group._min.periodEnd ? daysBetween(group._min.periodEnd, now) : 0,
      }))
      .filter((row) => row.daysOverdue > 0 && OVERDUE_CHECKPOINT_SET.has(row.daysOverdue));

    // أسماء المشتركين فقط لمن سيُرسل لهم تنبيه فعلًا — لا join على كل الفواتير.
    const customerNames = new Map<string, string>();
    for (const batch of chunked(dueForNotice.map((r) => r.customerId), CHUNK)) {
      const customers = await db.customer.findMany({
        where: { id: { in: batch } },
        select: { id: true, name: true },
      });
      for (const customer of customers) customerNames.set(customer.id, customer.name);
    }

    for (const row of dueForNotice) {
      notifications.push({
        workspaceId: row.workspaceId,
        userId: null,
        type: "DEBT",
        title: "مشترك متأخر عن الدفع",
        body: `المشترك ${customerNames.get(row.customerId) ?? "مشترك"} تأخر ${row.daysOverdue} ${
          row.daysOverdue === 1 ? "يوم" : "أيام"
        } عن تسديد اشتراكه.`,
      });
    }
    const overdueNotified = dueForNotice.length;

    // ---------------------------------------------------------------
    // 2) مواعيد صيانة مستحقة اليوم بالضبط — استعلام واحد لكل المنصّة.
    // ---------------------------------------------------------------
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const tomorrowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

    const dueMaintenance = await db.maintenanceRecord.findMany({
      where: {
        nextMaintenanceDate: { gte: todayStart, lt: tomorrowStart },
        workspace: { status: "ACTIVE" },
      },
      select: { workspaceId: true, type: true, equipment: { select: { name: true } } },
    });

    for (const record of dueMaintenance) {
      notifications.push({
        workspaceId: record.workspaceId,
        userId: null,
        type: "MAINTENANCE",
        title: "موعد صيانة اليوم",
        body: `موعد صيانة "${record.type}" لـ ${record.equipment.name} اليوم.`,
      });
    }
    const maintenanceNotified = dueMaintenance.length;

    // ---------------------------------------------------------------
    // 3) مخزون الوقود المنخفض — استعلاما تجميع اثنان لكل المنصّة بدل استعلامين لكل workspace.
    // ---------------------------------------------------------------
    const [purchaseByWorkspace, usageByWorkspace] = await Promise.all([
      db.fuelPurchase.groupBy({
        by: ["workspaceId"],
        where: { workspace: { status: "ACTIVE" } },
        _sum: { quantityLiters: true },
      }),
      db.fuelUsage.groupBy({
        by: ["workspaceId"],
        where: { workspace: { status: "ACTIVE" } },
        _sum: { quantityLiters: true },
      }),
    ]);

    const purchased = new Map(purchaseByWorkspace.map((r) => [r.workspaceId, Number(r._sum.quantityLiters ?? 0)]));
    const used = new Map(usageByWorkspace.map((r) => [r.workspaceId, Number(r._sum.quantityLiters ?? 0)]));

    let lowFuelNotified = 0;
    let workspacesScanned = 0;
    let cursor: string | undefined;

    for (;;) {
      const workspaces = await db.workspace.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
        orderBy: { id: "asc" },
        take: CHUNK,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (workspaces.length === 0) break;

      workspacesScanned += workspaces.length;
      cursor = workspaces[workspaces.length - 1]!.id;

      for (const workspace of workspaces) {
        const stock = (purchased.get(workspace.id) ?? 0) - (used.get(workspace.id) ?? 0);
        if (stock < LOW_FUEL_THRESHOLD_LITERS) {
          notifications.push({
            workspaceId: workspace.id,
            userId: null,
            type: "SYSTEM",
            title: "مخزون الوقود منخفض",
            body: `المخزون الحالي ${stock.toLocaleString("ar-IQ")} لتر فقط — يُفضّل شراء وقود قريبًا.`,
          });
          lowFuelNotified += 1;
        }
      }

      if (workspaces.length < CHUNK) break;
    }

    const written = await insertNotifications(notifications);

    // تنظيف الجداول التشغيلية — نوافذ rate limit، وسجلات التشغيل، والأعمال المكتملة،
    // والإشعارات المقروءة القديمة. سجل التدقيق والسجل المالي لا يُمسّان (انظر retention.ts).
    const [prunedAiBuckets, prunedGenericBuckets, retention] = await Promise.all([
      pruneAiRateLimitBuckets(),
      pruneRateLimitBuckets(),
      runRetention(),
    ]);

    return {
      processed: written,
      details: {
        workspacesScanned,
        overdueNotified,
        maintenanceNotified,
        lowFuelNotified,
        notificationsWritten: written,
        prunedAiBuckets,
        prunedGenericBuckets,
        retention,
      },
    };
  });
}
