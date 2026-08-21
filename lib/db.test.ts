import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildDatabaseUrl } from "./db";

const BASE = "postgresql://user:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true";

function paramsOf(url: string | undefined) {
  return new URL(url!).searchParams;
}

describe("buildDatabaseUrl", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete process.env.DATABASE_CONNECTION_LIMIT;
    delete process.env.DATABASE_POOL_TIMEOUT;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("يفرض القيم الافتراضية عندما لا يحمل العنوان أي ضبط", () => {
    const params = paramsOf(buildDatabaseUrl(BASE));
    expect(params.get("connection_limit")).toBe("5");
    expect(params.get("pool_timeout")).toBe("20");
  });

  it("يستبدل أي connection_limit موجود في العنوان — لا يترك ملفات البيئة تتحكم", () => {
    const withOne = `${BASE}&connection_limit=1`;
    expect(paramsOf(buildDatabaseUrl(withOne)).get("connection_limit")).toBe("5");
  });

  it("يحترم متغيرات البيئة الصريحة", () => {
    process.env.DATABASE_CONNECTION_LIMIT = "9";
    process.env.DATABASE_POOL_TIMEOUT = "45";
    const params = paramsOf(buildDatabaseUrl(BASE));
    expect(params.get("connection_limit")).toBe("9");
    expect(params.get("pool_timeout")).toBe("45");
  });

  it("يتجاهل القيم غير الصالحة ويعود للافتراضي", () => {
    for (const bad of ["0", "-3", "abc", "2.5", ""]) {
      process.env.DATABASE_CONNECTION_LIMIT = bad;
      expect(paramsOf(buildDatabaseUrl(BASE)).get("connection_limit")).toBe("5");
    }
  });

  it("يضيف pgbouncer=true تلقائيًا على pooler الـ transaction", () => {
    const withoutFlag = "postgresql://user:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
    expect(paramsOf(buildDatabaseUrl(withoutFlag)).get("pgbouncer")).toBe("true");
  });

  it("لا يفرض pgbouncer على اتصال PostgreSQL مباشر", () => {
    const direct = "postgresql://user:pw@localhost:5432/ampere_test";
    expect(paramsOf(buildDatabaseUrl(direct)).get("pgbouncer")).toBeNull();
  });

  it("يضبط التجمّع حتى على الاتصال المباشر (اختبارات التكامل تحتاجه أيضًا)", () => {
    const direct = "postgresql://user:pw@localhost:5432/ampere_test";
    expect(paramsOf(buildDatabaseUrl(direct)).get("connection_limit")).toBe("5");
  });

  it("يُعيد undefined عند غياب العنوان، ويمرّر العنوان التالف كما هو", () => {
    // الوسيط الافتراضي يقرأ process.env.DATABASE_URL، فلا يكفي تمرير undefined صراحةً.
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(buildDatabaseUrl()).toBeUndefined();
    } finally {
      if (previous !== undefined) process.env.DATABASE_URL = previous;
    }
    expect(buildDatabaseUrl("not-a-url")).toBe("not-a-url");
  });

  it("لا يفقد بيانات الاعتماد أو اسم قاعدة البيانات", () => {
    const result = new URL(buildDatabaseUrl(BASE)!);
    expect(result.username).toBe("user");
    expect(result.password).toBe("pw");
    expect(result.pathname).toBe("/postgres");
    expect(result.port).toBe("6543");
  });
});
