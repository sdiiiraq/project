// حارس قاعدة بيانات الاختبار.
//
// اختبارات التكامل تكتب وتحذف بيانات. تشغيلها بالخطأ على قاعدة الإنتاج كارثي،
// والمشروع يضع نفس عنوان Supabase الإنتاجي في .env و .env.local — لذلك الحارس هنا
// يرفض التشغيل ما لم تكن الوجهة قاعدة بيانات اختبار حقيقية ومعزولة.

const testUrl = process.env.DATABASE_URL_TEST;

function fail(message: string, hint?: string[]): never {
  throw new Error(["", message, ...(hint ?? []), ""].join("\n"));
}

if (!testUrl) {
  fail("DATABASE_URL_TEST غير معرَّف — اختبارات التكامل لن تعمل.", [
    "",
    "الأسهل (يُقلع PostgreSQL مؤقتة تلقائيًا، بلا Docker وبلا تثبيت):",
    "  pnpm test:integration:local",
    "",
    "أو وجّهه إلى قاعدة بيانات اختبار خاصة بك:",
    '  DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/ampere_test"',
    "  pnpm test:db:setup && pnpm test:integration",
  ]);
}

let parsed: URL;
try {
  parsed = new URL(testUrl);
} catch {
  fail(`DATABASE_URL_TEST ليس عنوانًا صالحًا: ${testUrl}`);
}

// PgBouncer في وضع transaction لا يدعم prepared statements ولا الأقفال الممتدة عبر
// الجلسة، وهو أيضًا المسار الذي يستخدمه الإنتاج. اختبارات التزامن يجب أن تصل مباشرة.
if (/pooler\.supabase\.com/.test(parsed.hostname) || parsed.port === "6543" || /pgbouncer=true/.test(testUrl)) {
  fail("DATABASE_URL_TEST يشير إلى connection pooler (PgBouncer/Supavisor).", [
    "استخدم اتصالًا مباشرًا بـ PostgreSQL — اختبارات التزامن لا تصح خلف pooler.",
  ]);
}

// الدفاع الأقوى: لا يُسمح بقاعدة بيانات بعيدة إلا بموافقة صريحة. مجرد اختلاف العنوان
// عن الإنتاج ليس ضمانًا كافيًا — قد يكون عنوان إنتاج آخر.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
if (!LOCAL_HOSTS.has(parsed.hostname) && process.env.ALLOW_REMOTE_TEST_DB !== "yes") {
  fail(`DATABASE_URL_TEST يشير إلى مضيف بعيد (${parsed.hostname}).`, [
    "اختبارات التكامل تحذف بيانات. إن كنت متأكدًا أنها قاعدة اختبار مخصصة، اضبط:",
    "  ALLOW_REMOTE_TEST_DB=yes",
  ]);
}

if (process.env.DATABASE_URL && process.env.DATABASE_URL === testUrl) {
  fail("DATABASE_URL_TEST مطابق لـ DATABASE_URL — يجب أن تكون قاعدة بيانات منفصلة.");
}

// يجب أن يحدث قبل أول استيراد لـ lib/db (setupFiles تعمل قبل ملفات الاختبار).
process.env.DATABASE_URL = testUrl;
process.env.DIRECT_URL = testUrl;
