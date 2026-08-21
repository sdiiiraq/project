import { defineConfig } from "vitest/config";
import path from "node:path";

// اختبارات الوحدة فقط — لا تلمس قاعدة بيانات. اختبارات التكامل لها إعداد منفصل
// (vitest.integration.config.ts) لأنها تتطلب PostgreSQL حقيقية ومعزولة.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.ts"],
    exclude: ["node_modules/**", "test/integration/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "server-only": path.resolve(__dirname, "./test/server-only-mock.ts"),
    },
  },
});
