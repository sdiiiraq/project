import { defineConfig } from "vitest/config";
import path from "node:path";

// اختبارات التكامل والتزامن — تعمل ضد PostgreSQL حقيقية عبر DATABASE_URL_TEST فقط.
// انظر test/integration/setup.ts: يرفض التشغيل إن لم تكن قاعدة بيانات اختبار مخصصة.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    setupFiles: ["./test/integration/setup.ts"],
    // ملفات متسلسلة: اختبارات التزامن تتحكم بتزامنها بنفسها داخل الملف،
    // وتوازي الملفات يُفسد قياس التزامن ويستهلك اتصالات بلا داعٍ.
    fileParallelism: false,
    pool: "forks",
    testTimeout: 120_000,
    hookTimeout: 120_000,
    env: {
      // الحصة الشهرية والـ rate limit يعملان معًا. لاختبار الحصة وحدها نرفع حدّ
      // الدقيقة، ولاختبار حدّ الدقيقة نستخدم workspace بلا حد شهري.
      AI_RATE_LIMIT_PER_MINUTE: "10000",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "./test/server-only-mock.ts"),
    },
  },
});
