// يطبّق migrations على قاعدة بيانات الاختبار فقط (DATABASE_URL_TEST).
// موجود كسكربت بدل أمر shell مباشر لأن طريقة تمرير متغيرات البيئة تختلف بين bash و PowerShell.
import { spawnSync } from "node:child_process";

const testUrl = process.env.DATABASE_URL_TEST;

if (!testUrl) {
  console.error("DATABASE_URL_TEST غير معرَّف. اضبطه أولًا، مثال:");
  console.error('  DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/ampere_test"');
  process.exit(1);
}

if (/pooler\.supabase\.com|pgbouncer=true|:6543/.test(testUrl)) {
  console.error("DATABASE_URL_TEST يشير إلى connection pooler — استخدم اتصالًا مباشرًا بـ PostgreSQL.");
  process.exit(1);
}

const result = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, DATABASE_URL: testUrl, DIRECT_URL: testUrl },
});

process.exit(result.status ?? 1);
