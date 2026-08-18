import { NextResponse } from "next/server";
import { signupWithEmail, signupWithPhone } from "@/lib/auth/signup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/auth/signup — يعيد 201 عند النجاح، و 4xx/5xx مع رسالة واضحة عند الفشل.
export async function POST(request: Request) {
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
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
