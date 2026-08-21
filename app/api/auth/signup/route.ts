import { NextResponse } from "next/server";
import { signupWithEmail, signupWithPhone } from "@/lib/auth/signup";
import { consumeRateLimit, clientIdentifier } from "@/lib/domain/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// حد إنشاء الحسابات لكل عنوان خلال نافذة — المسار عام تمامًا (خارج middleware auth)،
// فبدونه يمكن لأي شخص استهلاك حصة Supabase وإغراق جدول المستخدمين.
const SIGNUP_LIMIT = 5;
const SIGNUP_WINDOW_SECONDS = 600;

// POST /api/auth/signup — يعيد 201 عند النجاح، و 4xx/5xx مع رسالة واضحة عند الفشل.
export async function POST(request: Request) {
  const { allowed, retryAfterSeconds } = await consumeRateLimit({
    scope: "signup",
    identifier: clientIdentifier(request),
    limit: SIGNUP_LIMIT,
    windowSeconds: SIGNUP_WINDOW_SECONDS,
  });

  if (!allowed) {
    return NextResponse.json(
      { error: "محاولات إنشاء حساب كثيرة. انتظر قليلًا ثم حاول مجددًا.", code: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "صيغة الطلب غير صحيحة (JSON مطلوب).", code: "invalid_json" },
      { status: 400 },
    );
  }

  const body = payload as { mode?: unknown } | null;
  const mode = body && typeof body === "object" ? body.mode : undefined;
  if (mode !== "email" && mode !== "phone") {
    return NextResponse.json(
      { error: 'حقل mode مطلوب ويجب أن يكون "email" أو "phone".', code: "invalid_mode" },
      { status: 400 },
    );
  }

  try {
    const result = mode === "email" ? await signupWithEmail(payload) : await signupWithPhone(payload);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error("[signup] unhandled error", error);
    return NextResponse.json(
      {
        error: "خطأ غير متوقع في الخادم أثناء إنشاء الحساب.",
        code: "internal_error",
      },
      { status: 500 },
    );
  }
}
