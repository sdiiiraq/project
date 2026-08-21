import { PrismaClient } from "@prisma/client";

// ============================================================
// عميل Prisma + ضبط تجمّع الاتصالات (connection pool).
//
// لماذا لا تُترك هذه الإعدادات داخل DATABASE_URL؟
// لأنها كانت كذلك فعلًا، والنتيجة أن .env كان يحمل connection_limit=5 و.env.local
// يحمل connection_limit=1 لنفس قاعدة البيانات — و.env.local يفوز حسب ترتيب أولويات
// Next.js. أي أن الإعداد الفعلي كان يعتمد على أي ملف موجود، وهو ما أنتج في البناء:
//   "Timed out fetching a new connection from the connection pool (connection limit: 1)"
//
// الآن: مصدر واحد للحقيقة هنا، قابل للضبط عبر متغيرات بيئة صريحة، ومع تحذيرات
// عند أي إعداد غير متسق. عنوان قاعدة البيانات يبقى للاتصال فقط، لا للضبط.
// ============================================================

/**
 * عدد الاتصالات التي يفتحها *كل instance* من التطبيق.
 *
 * الحساب الذي يحكم هذه القيمة:
 *   (أقصى عدد instances متزامنة على Vercel) × (connection_limit)
 *      ≤ أقصى عدد client connections يسمح به Supavisor في خطة Supabase
 *
 * لماذا ليست 1 (وهي التوصية الشائعة لـ serverless خلف pooler خارجي)؟
 * لأن هذا التطبيق تحديدًا يُصدر استعلامات متوازية داخل الطلب الواحد (لوحة التحكم
 * وحدها 14 استعلامًا في Promise.all)، ويستخدم 14 معاملة تفاعلية تمسك الاتصال طوال
 * مدتها. عند القيمة 1 تتناوب كل هذه على اتصال واحد، فيتحول التوازي إلى تسلسل،
 * وتفشل الطلبات بانتهاء مهلة انتظار الاتصال تحت الحمل.
 *
 * ولماذا ليست كبيرة؟ لأن عدد instances على Vercel غير محدود ولا يمكن التنبؤ به،
 * وضربه في رقم كبير يستنفد pooler قاعدة البيانات عند أول موجة ضغط.
 */
const DEFAULT_CONNECTION_LIMIT = 5;

/**
 * مهلة انتظار اتصال من التجمّع (بالثواني). الافتراضي في Prisma هو 10 ثوانٍ،
 * وهو قصير عندما تصطف عدة استعلامات متوازية خلف عدد محدود من الاتصالات.
 */
const DEFAULT_POOL_TIMEOUT_SECONDS = 20;

/**
 * مهلة انتظار اتصال لبدء معاملة تفاعلية (بالمللي ثانية).
 *
 * افتراضي Prisma هو 2000ms، وهو غير متسق مع pool_timeout البالغ 20 ثانية: استعلام عادي
 * ينتظر اتصالًا 20 ثانية، بينما معاملة تستسلم بعد ثانيتين. اختبار الحمل أظهر أثر ذلك
 * مباشرةً — عند 200 كتابة متزامنة على نفس المولدة فشلت 58 عملية بـ P2028
 * ("Unable to start a transaction in the given time")، لا لخلل منطقي بل لهذا التفاوت.
 */
const DEFAULT_TX_MAX_WAIT_MS = 10_000;

/**
 * أقصى مدة للمعاملة نفسها (بالمللي ثانية). افتراضي Prisma 5000ms.
 * أطول عملية هنا (إضافة مشترك) تنفّذ ست عمليات متتالية، وقد تصطف تحت الحمل.
 * تبقى القيمة أقل من maxDuration على Vercel حتى لا تُقطع الدالة قبل انتهاء المعاملة.
 */
const DEFAULT_TX_TIMEOUT_MS = 20_000;

function readPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * يبني عنوان الاتصال النهائي: يأخذ DATABASE_URL كما هو ويفرض عليه معاملات التجمّع
 * من مصدر واحد. أي قيمة موجودة مسبقًا في العنوان تُستبدل عمدًا حتى لا يعود
 * الاختلاف بين ملفات البيئة ممكنًا.
 */
export function buildDatabaseUrl(raw: string | undefined = process.env.DATABASE_URL): string | undefined {
  if (!raw) return undefined;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // عنوان غير صالح: نمرّره كما هو ليُصدر Prisma رسالته الواضحة بدل أن نبتلع الخطأ.
    return raw;
  }

  const connectionLimit = readPositiveInt(process.env.DATABASE_CONNECTION_LIMIT, DEFAULT_CONNECTION_LIMIT);
  const poolTimeout = readPositiveInt(process.env.DATABASE_POOL_TIMEOUT, DEFAULT_POOL_TIMEOUT_SECONDS);

  url.searchParams.set("connection_limit", String(connectionLimit));
  url.searchParams.set("pool_timeout", String(poolTimeout));

  // المنفذ 6543 على Supabase هو Supavisor في وضع transaction، وهو لا يدعم
  // prepared statements. Prisma يحتاج pgbouncer=true لتعطيلها، وإلا تظهر أخطاء
  // "prepared statement already exists" تحت التزامن.
  const isTransactionPooler = url.port === "6543" || /pooler\.supabase\.com/.test(url.hostname);
  if (isTransactionPooler && url.searchParams.get("pgbouncer") !== "true") {
    url.searchParams.set("pgbouncer", "true");
  }

  return url.toString();
}

/** تحذيرات إعداد — تُطبع مرة واحدة عند الإقلاع، بلا أي أسرار. */
function warnOnSuspiciousConfig(): void {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error(JSON.stringify({ level: "error", event: "db.config", message: "DATABASE_URL غير مضبوط." }));
    return;
  }

  try {
    const url = new URL(raw);
    const direct = process.env.DIRECT_URL ? new URL(process.env.DIRECT_URL) : null;

    // العكس (تطبيق على session pooler، وmigrations على transaction pooler) يسبب
    // استنفاد اتصالات في الأول وفشل migrations في الثاني.
    if (url.port === "5432" && direct?.port === "6543") {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "db.config",
          message: "DATABASE_URL و DIRECT_URL يبدوان معكوسين: التطبيق يجب أن يستخدم 6543 والـ migrations 5432.",
        }),
      );
    }
  } catch {
    // عنوان غير قابل للتحليل — Prisma سيُبلّغ عنه.
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  warnOnSuspiciousConfig();
  const datasourceUrl = buildDatabaseUrl();
  return new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    transactionOptions: {
      maxWait: readPositiveInt(process.env.DATABASE_TX_MAX_WAIT_MS, DEFAULT_TX_MAX_WAIT_MS),
      timeout: readPositiveInt(process.env.DATABASE_TX_TIMEOUT_MS, DEFAULT_TX_TIMEOUT_MS),
    },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

// في التطوير فقط: إعادة الاستخدام عبر globalThis تمنع تسرّب الاتصالات مع hot reload.
// في الإنتاج كل instance يُنشئ عميلًا واحدًا في نطاق الموديول، وهو السلوك المطلوب.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
