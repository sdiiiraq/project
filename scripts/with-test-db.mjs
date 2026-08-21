// يشغّل أمرًا مقابل PostgreSQL حقيقية مؤقتة.
//
// السبب: اختبارات التزامن والتكامل لا تُثبت شيئًا مقابل mock. هذا السكربت يُقلع نسخة
// PostgreSQL فعلية (ثنائيات رسمية عبر embedded-postgres — بلا Docker وبلا صلاحيات مدير)،
// يطبّق الـ migrations عليها، يشغّل الأمر المطلوب، ثم يوقفها ويحذف بياناتها.
//
// الاستخدام:
//   node scripts/with-test-db.mjs pnpm test:integration
//   node scripts/with-test-db.mjs npx prisma migrate deploy
//
// إن كان DATABASE_URL_TEST مضبوطًا مسبقًا فسيُستخدم كما هو ولن تُقلع نسخة محلية —
// هذا هو المسار المستخدم في CI أو مقابل staging.

import EmbeddedPostgres from "embedded-postgres";
import { spawnSync } from "node:child_process";
import { rmSync, existsSync, readdirSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { createServer } from "node:net";
import path from "node:path";

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error("الاستخدام: node scripts/with-test-db.mjs <command> [args...]");
  process.exit(1);
}

/** منفذ حر يختاره النظام — يمنع التصادم مع نسخة بقيت حيّة من تشغيل سابق. */
async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

const PORT = Number(process.env.TEST_DB_PORT) || (await findFreePort());
const DATABASE = "ampere_test";
// مجلد بيانات فريد لكل تشغيل: نسخة عالقة من تشغيل سابق تحتفظ بذاكرة مشتركة مرتبطة
// بمجلدها، فمشاركة المجلد كانت تُفشل الإقلاع بـ "pre-existing shared memory block".
const DATA_DIR = path.resolve(`.pgdata-test-${process.pid}`);

function run(url) {
  const result = spawnSync(command[0], command.slice(1), {
    stdio: "inherit",
    shell: true,
    // DATABASE_URL لا يُمرَّر عمدًا: حارس الاختبارات يرفض تطابقه مع DATABASE_URL_TEST،
    // و test/integration/setup.ts هو الذي يضبطه بعد اجتياز كل الفحوص.
    env: { ...process.env, DATABASE_URL_TEST: url },
  });
  return result.status ?? 1;
}

// مسار CI/staging: قاعدة بيانات جاهزة، لا نُقلع شيئًا.
if (process.env.DATABASE_URL_TEST) {
  console.log("[test-db] استخدام DATABASE_URL_TEST الموجود مسبقًا.");
  process.exit(run(process.env.DATABASE_URL_TEST));
}

/**
 * حذف مجلد البيانات. على Windows يبقى ملف القفل مشغولًا للحظات بعد إيقاف العملية،
 * فنعيد المحاولة بدل الفشل بـ EBUSY وترك بقايا تمنع التشغيل التالي.
 */
async function removeDataDir() {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      rmSync(DATA_DIR, { recursive: true, force: true });
      return true;
    } catch (error) {
      if (attempt === 10) {
        console.warn(`[test-db] تعذّر حذف ${DATA_DIR}: ${error.code ?? error}. احذفه يدويًا.`);
        return false;
      }
      await sleep(300);
    }
  }
  return false;
}

/** تنظيف مجلدات تشغيلات سابقة فشل تنظيفها — best effort، لا يُفشل التشغيل الحالي. */
function removeOrphanDataDirs() {
  for (const entry of readdirSync(process.cwd(), { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(".pgdata-test")) continue;
    if (path.resolve(entry.name) === DATA_DIR) continue;
    try {
      rmSync(path.resolve(entry.name), { recursive: true, force: true });
      console.log(`[test-db] حُذف مجلد متروك: ${entry.name}`);
    } catch {
      // نسخة ما زالت حيّة تمسك المجلد — لا يعنينا، منفذنا ومجلدنا مختلفان.
    }
  }
}

removeOrphanDataDirs();
if (existsSync(DATA_DIR)) await removeDataDir();

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: "postgres",
  password: "postgres",
  port: PORT,
  persistent: false,
  // إلزامي: initdb على Windows يختار ترميز النظام (WIN1252) افتراضيًا، فتفشل أي
  // migration تحتوي نصًا عربيًا بالخطأ 22P05. الإنتاج على Supabase يعمل بـ UTF8،
  // فيجب أن تطابقه قاعدة الاختبار وإلا اختبرنا بيئة مختلفة عن الحقيقية.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: () => {},
});

let exitCode = 1;

function explainStartupFailure(error) {
  const text = String(error?.message ?? error);
  if (/shared memory block is still in use|could not bind|address already in use/i.test(text)) {
    console.error(
      [
        "",
        "[test-db] هناك نسخة PostgreSQL من تشغيل سابق ما زالت حيّة على المنفذ " + PORT + ".",
        "يحدث هذا إذا أُنهي التشغيل السابق بالقوة (Ctrl-C) قبل أن ينظّف.",
        "",
        "الحل:",
        "  Windows:  Get-Process postgres | Stop-Process -Force",
        "  Linux/macOS:  pkill -f 'postgres.*" + PORT + "'",
        "",
        "أو استخدم منفذًا آخر:  TEST_DB_PORT=55433 pnpm test:integration:local",
        "",
      ].join(String.fromCharCode(10)),
    );
  }
}

try {
  console.log("[test-db] تهيئة PostgreSQL (قد يُنزّل الثنائيات في أول تشغيل)...");
  await pg.initialise();

  console.log(`[test-db] إقلاع على المنفذ ${PORT}...`);
  await pg.start();

  await pg.createDatabase(DATABASE);
  const url = `postgresql://postgres:postgres@localhost:${PORT}/${DATABASE}`;
  console.log(`[test-db] جاهزة: ${url}`);

  console.log("[test-db] تطبيق الـ migrations...");
  const migrate = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });

  if (migrate.status !== 0) {
    console.error("[test-db] فشل تطبيق الـ migrations — توقف قبل تشغيل الأمر.");
    exitCode = migrate.status ?? 1;
  } else {
    exitCode = run(url);
  }
} catch (error) {
  console.error("[test-db] خطأ:", error);
  explainStartupFailure(error);
  exitCode = 1;
} finally {
  try {
    await pg.stop();
  } catch {
    // النسخة قد لا تكون أقلعت أصلًا.
  }
  await removeDataDir();
  console.log("[test-db] تم الإيقاف والتنظيف.");
}

process.exit(exitCode);
