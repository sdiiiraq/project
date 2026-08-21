// قياس خطط تنفيذ PostgreSQL للاستعلامات الحرجة، على بيانات بحجم واقعي.
//
// يُشغَّل عبر: pnpm db:explain
// (سكربت with-test-db يُقلع PostgreSQL مؤقتة ويطبّق الـ migrations قبل تشغيله)
//
// يُنشئ عميل Prisma خاصًا به من DATABASE_URL_TEST صراحةً — لا يعتمد إطلاقًا على
// DATABASE_URL حتى لا يمكن أن يعمل بالخطأ على قاعدة الإنتاج.

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  console.error("DATABASE_URL_TEST مطلوب. شغّل عبر: pnpm db:explain");
  process.exit(1);
}
if (!/localhost|127\.0\.0\.1/.test(new URL(testUrl).hostname) && process.env.ALLOW_REMOTE_TEST_DB !== "yes") {
  console.error("هذا السكربت يكتب بيانات ضخمة — لن يعمل على مضيف بعيد بلا ALLOW_REMOTE_TEST_DB=yes");
  process.exit(1);
}

const db = new PrismaClient({ datasourceUrl: testUrl });

const CUSTOMER_COUNT = Number(process.env.EXPLAIN_CUSTOMERS) || 50_000;
const INVOICE_MONTHS = 3;
const BATCH = 5_000;

type PlanRow = { "QUERY PLAN": string };

async function explain(label: string, sql: string, params: unknown[] = []): Promise<void> {
  const rows = await db.$queryRawUnsafe<PlanRow[]>(`EXPLAIN (ANALYZE, BUFFERS, TIMING) ${sql}`, ...params);
  const plan = rows.map((r) => r["QUERY PLAN"]).join("\n");

  const timing = /Execution Time: ([\d.]+) ms/.exec(plan)?.[1] ?? "?";
  const scan = /(Seq Scan|Bitmap Heap Scan|Index Scan|Index Only Scan|Parallel Seq Scan)/.exec(plan)?.[1] ?? "?";

  console.log(`\n──────── ${label}`);
  console.log(`   المسح: ${scan}   |   زمن التنفيذ: ${timing} ms`);
  console.log(
    plan
      .split("\n")
      .map((l) => `   ${l}`)
      .join("\n"),
  );
}

const WORKSPACE_COUNT = Number(process.env.EXPLAIN_WORKSPACES) || 200;
const BIG_WORKSPACE_CUSTOMERS = Number(process.env.EXPLAIN_BIG_WS) || 5_000;

const FIRST_NAMES = ["محمد", "أحمد", "علي", "حسين", "فاطمة", "زينب", "عمر", "مصطفى", "كريم", "نور"];
const LAST_NAMES = ["العبيدي", "الجبوري", "الدليمي", "الحسني", "الزيدي", "الساعدي", "التميمي", "الربيعي"];

/**
 * توزيع واقعي: مئات المولدات، وواحدة كبيرة تمثّل أسوأ حالة مستأجر فردي.
 *
 * التوزيع مهم للقياس: لو احتكرت مولدة واحدة معظم الصفوف، فإن فلتر workspaceId يصبح
 * بلا انتقائية ويختار المُخطِّط Seq Scan — وهو القرار الصحيح في تلك الحالة لكنه لا
 * يمثّل الإنتاج إطلاقًا. القياس على بيانات غير واقعية أسوأ من عدم القياس.
 */
async function seed(): Promise<{ workspaceId: string; totalCustomers: number }> {
  console.log(`
[seed] ${WORKSPACE_COUNT} مولدة، أكبرها ${BIG_WORKSPACE_CUSTOMERS.toLocaleString("en")} مشترك...`);

  const workspaces: { id: string; generatorId: string; planId: string; customers: number }[] = [];
  const smallShare = Math.max(
    50,
    Math.floor((CUSTOMER_COUNT - BIG_WORKSPACE_CUSTOMERS) / Math.max(1, WORKSPACE_COUNT - 1)),
  );

  for (let w = 0; w < WORKSPACE_COUNT; w++) {
    const userId = randomUUID();
    await db.user.create({ data: { id: userId, fullName: `مالك ${w}`, email: `owner-${userId}@example.test` } });
    const workspace = await db.workspace.create({
      data: { name: `مولدة ${w}`, ownerId: userId, status: "ACTIVE", normalAmperePriceIQD: 10_000 },
    });
    const generator = await db.generator.create({ data: { workspaceId: workspace.id, name: `مولدة ${w}` } });
    const plan = await db.amperePlan.create({
      data: { workspaceId: workspace.id, amperes: 5, tier: "NORMAL", monthlyPrice: 50_000, isCustom: true },
    });
    workspaces.push({
      id: workspace.id,
      generatorId: generator.id,
      planId: plan.id,
      customers: w === 0 ? BIG_WORKSPACE_CUSTOMERS : smallShare,
    });
  }

  let serial = 0;
  for (const ws of workspaces) {
    for (let offset = 0; offset < ws.customers; offset += BATCH) {
      const size = Math.min(BATCH, ws.customers - offset);
      await db.customer.createMany({
        data: Array.from({ length: size }, (_, i) => {
          const n = serial + offset + i;
          return {
            workspaceId: ws.id,
            generatorId: ws.generatorId,
            subscriberNumber: String(offset + i + 1).padStart(6, "0"),
            name: `${FIRST_NAMES[n % FIRST_NAMES.length]} ${LAST_NAMES[n % LAST_NAMES.length]} ${n}`,
            phone: `0770${String(n).padStart(7, "0")}`,
            houseNumber: String((n % 400) + 1),
            status: (["ACTIVE", "OVERDUE", "SUSPENDED"] as const)[n % 3],
            createdAt: new Date(Date.now() - (n % 900) * 86_400_000),
          };
        }),
        skipDuplicates: true,
      });
    }
    serial += ws.customers;
    if (workspaces.indexOf(ws) % 25 === 0) {
      process.stdout.write(`
[seed] مشتركون: ${serial.toLocaleString("en")}`);
    }
  }
  console.log(`
[seed] مشتركون: ${serial.toLocaleString("en")}          `);

  // اشتراكات لكل المشتركين، وفواتير لثلاثة أشهر — موزّعة على كل المولدات.
  for (const ws of workspaces) {
    const customers = await db.customer.findMany({ where: { workspaceId: ws.id }, select: { id: true } });
    for (let offset = 0; offset < customers.length; offset += BATCH) {
      const slice = customers.slice(offset, offset + BATCH);
      await db.customerSubscription.createMany({
        data: slice.map((c) => ({
          customerId: c.id,
          amperePlanId: ws.planId,
          amperes: 5,
          tier: "NORMAL" as const,
          price: 50_000,
          startDate: new Date(),
          status: "ACTIVE" as const,
        })),
      });
    }
  }
  console.log("[seed] اشتراكات جاهزة");

  for (let m = 0; m < INVOICE_MONTHS; m++) {
    const periodStart = new Date(Date.UTC(2030, m, 1));
    const periodEnd = new Date(Date.UTC(2030, m + 1, 0, 23, 59, 59, 999));
    for (const ws of workspaces) {
      const subs = await db.customerSubscription.findMany({
        where: { customer: { workspaceId: ws.id } },
        select: { id: true, customerId: true },
      });
      for (let offset = 0; offset < subs.length; offset += BATCH) {
        const slice = subs.slice(offset, offset + BATCH);
        await db.invoice.createMany({
          data: slice.map((sub, i) => ({
            workspaceId: ws.id,
            customerId: sub.customerId,
            subscriptionId: sub.id,
            periodStart,
            periodEnd,
            amount: 50_000,
            paidAmount: i % 3 === 0 ? 50_000 : 0,
            status: i % 3 === 0 ? ("PAID" as const) : ("UNPAID" as const),
          })),
          skipDuplicates: true,
        });
      }
    }
    process.stdout.write(`
[seed] فواتير: شهر ${m + 1}/${INVOICE_MONTHS}`);
  }
  console.log();

  console.log("[seed] ANALYZE...");
  await db.$executeRawUnsafe("ANALYZE");

  const counts = {
    workspaces: await db.workspace.count(),
    customers: await db.customer.count(),
    invoices: await db.invoice.count(),
  };
  console.log(`[seed] جاهز: ${JSON.stringify(counts)}`);

  return { workspaceId: workspaces[0]!.id, totalCustomers: counts.customers };
}

async function main() {
  const { workspaceId } = await seed();

  console.log("\n\n════════ قبل: بلا فهارس trigram ════════");
  await db.$executeRawUnsafe(`DROP INDEX IF EXISTS "customers_name_idx"`);
  await db.$executeRawUnsafe(`DROP INDEX IF EXISTS "customers_phone_idx"`);
  await db.$executeRawUnsafe("ANALYZE customers");

  const searchSql = `
    SELECT id, name, phone FROM customers
    WHERE "workspaceId" = $1::uuid AND "deletedAt" IS NULL
      AND (name ILIKE $2 OR phone LIKE $2)
    ORDER BY "createdAt" DESC LIMIT 20`;

  await explain("بحث شائع (مطابقات كثيرة)", searchSql, [workspaceId, "%الجبوري%"]);
  await explain("بحث نادر (بلا مطابقات) — الحالة المرضية", searchSql, [workspaceId, "%زقموطي%"]);
  await explain("بحث برقم هاتف كامل", searchSql, [workspaceId, "%07700000499%"]);

  console.log("\n\n════════ بعد: مع فهارس trigram ════════");
  await db.$executeRawUnsafe(`CREATE INDEX "customers_name_idx" ON customers USING GIN (name gin_trgm_ops)`);
  await db.$executeRawUnsafe(`CREATE INDEX "customers_phone_idx" ON customers USING GIN (phone gin_trgm_ops)`);
  await db.$executeRawUnsafe("ANALYZE customers");

  await explain("بحث شائع (مطابقات كثيرة)", searchSql, [workspaceId, "%الجبوري%"]);
  await explain("بحث نادر (بلا مطابقات) — الحالة المرضية", searchSql, [workspaceId, "%زقموطي%"]);
  await explain("بحث برقم هاتف كامل", searchSql, [workspaceId, "%07700000499%"]);

  console.log("\n\n════════ استعلامات حرجة أخرى ════════");

  await explain(
    "قائمة المشتركين — الترتيب الافتراضي + تصفيح",
    `SELECT id, name FROM customers
     WHERE "workspaceId" = $1::uuid AND "deletedAt" IS NULL
     ORDER BY "createdAt" DESC LIMIT 20 OFFSET 0`,
    [workspaceId],
  );

  await explain(
    "عدّاد تبويب «مدفوع» (فاتورة الشهر الحالي)",
    `SELECT COUNT(*) FROM customers c
     WHERE c."workspaceId" = $1::uuid AND c."deletedAt" IS NULL
       AND EXISTS (SELECT 1 FROM invoices i
                   WHERE i."customerId" = c.id
                     AND i."periodStart" >= $2 AND i."periodStart" <= $3
                     AND i.status = 'PAID')`,
    [workspaceId, new Date(Date.UTC(2030, 0, 1)), new Date(Date.UTC(2030, 0, 31, 23, 59, 59, 999))],
  );

  await explain(
    "عدّاد تبويب «مدفوع» — بعد إضافة workspaceId للاستعلام الفرعي",
    `SELECT COUNT(*) FROM customers c
     WHERE c."workspaceId" = $1::uuid AND c."deletedAt" IS NULL
       AND EXISTS (SELECT 1 FROM invoices i
                   WHERE i."customerId" = c.id
                     AND i."workspaceId" = $1::uuid
                     AND i."periodStart" >= $2 AND i."periodStart" <= $3
                     AND i.status = 'PAID')`,
    [workspaceId, new Date(Date.UTC(2030, 0, 1)), new Date(Date.UTC(2030, 0, 31, 23, 59, 59, 999))],
  );

  await explain(
    "لوحة التحكم — تجميع الفواتير الشهرية",
    `SELECT "periodStart", SUM(amount), SUM("paidAmount") FROM invoices
     WHERE "workspaceId" = $1::uuid AND "periodStart" >= $2 AND "periodStart" <= $3
     GROUP BY "periodStart"`,
    [workspaceId, new Date(Date.UTC(2030, 0, 1)), new Date(Date.UTC(2030, 2, 31, 23, 59, 59, 999))],
  );

  await explain(
    "سحب أعمال الفوترة (FOR UPDATE SKIP LOCKED)",
    `SELECT id FROM billing_jobs
     WHERE status = 'PENDING'::"BillingJobStatus" AND "runAfter" <= now()
     ORDER BY "createdAt" ASC LIMIT 5 FOR UPDATE SKIP LOCKED`,
  );

  await explain(
    "سجل التدقيق — ترتيب عالمي مُصفَّح",
    `SELECT id, action FROM audit_logs ORDER BY "createdAt" DESC LIMIT 50`,
  );

  console.log("\n\n════════ أحجام الفهارس ════════");
  const sizes = await db.$queryRawUnsafe<{ index: string; size: string; table: string }[]>(`
    SELECT indexrelname AS index, relname AS table, pg_size_pretty(pg_relation_size(indexrelid)) AS size
    FROM pg_stat_user_indexes
    WHERE relname IN ('customers','invoices','audit_logs','notifications','billing_jobs')
    ORDER BY pg_relation_size(indexrelid) DESC`);
  for (const row of sizes) console.log(`   ${row.table.padEnd(16)} ${row.index.padEnd(48)} ${row.size}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
