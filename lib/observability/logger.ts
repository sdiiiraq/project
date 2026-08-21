import "server-only";

// ============================================================
// تسجيل مُهيكل (structured logging).
//
// لا توجد أداة مراقبة خارجية في المشروع (لا Sentry ولا غيره)، ولم أُضِف واحدة —
// السجلات تُكتب JSON على stdout/stderr، وهو ما تلتقطه Vercel أصلًا ويمكن البحث فيه
// وتصديره لاحقًا لأي أداة دون تغيير نقاط الاستدعاء.
//
// حماية التسريب: القيم تمر عبر مُنقٍّ يحذف أي مفتاح يبدو سرًّا (مفاتيح، رموز، كلمات مرور)
// ويقصّ النصوص الطويلة. لا تُسجَّل بيانات المشتركين الشخصية إطلاقًا — المعرّفات فقط.
// ============================================================

type LogLevel = "info" | "warn" | "error";

const REDACTED = "[محذوف]";
const SECRET_PATTERN = /(secret|token|password|apikey|api_key|authorization|cookie|key)$/i;
const MAX_STRING_LENGTH = 500;

export type LogFields = Record<string, unknown>;

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[عميق جدًا]";
  if (value === null || value === undefined) return value;

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();

  if (value instanceof Error) {
    return { name: value.name, message: sanitize(value.message, depth + 1) };
  }

  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitize(item, depth + 1));

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_PATTERN.test(key) ? REDACTED : sanitize(item, depth + 1);
    }
    return out;
  }

  return String(value);
}

function emit(level: LogLevel, event: string, fields: LogFields = {}): void {
  const payload = {
    level,
    event,
    at: new Date().toISOString(),
    ...(sanitize(fields) as LogFields),
  };

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const log = {
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};

/**
 * قياس زمن عملية وتسجيله. يُسجّل النجاح والفشل على السواء ثم يُعيد رمي الخطأ —
 * القياس لا يبتلع الأخطاء أبدًا.
 */
export async function measure<T>(event: string, fields: LogFields, operation: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    log.info(event, { ...fields, durationMs: Date.now() - startedAt, outcome: "success" });
    return result;
  } catch (error) {
    log.error(event, { ...fields, durationMs: Date.now() - startedAt, outcome: "failure", error });
    throw error;
  }
}
