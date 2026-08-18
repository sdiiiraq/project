"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isEmail, normalizeIraqiPhone } from "@/lib/utils/phone";
import { forgotPasswordSchema, loginSchema } from "@/lib/validation/auth";

export type ActionResult = { error: string } | { success: true };

export async function signInWithPassword(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  const { identifier, password } = parsed.data;

  // الدخول بالهاتف أو البريد + كلمة المرور فقط — بلا رمز تحقق أو SMS.
  const supabase = await createClient();
  const { error } = isEmail(identifier)
    ? await supabase.auth.signInWithPassword({ email: identifier, password })
    : await supabase.auth.signInWithPassword({ phone: normalizeIraqiPhone(identifier), password });

  if (error) {
    if (error.code === "phone_not_confirmed" || error.code === "email_not_confirmed") {
      return { error: "هذا الحساب غير مُفعّل. راجع الدعم الفني لتفعيله." };
    }
    return { error: "البريد/الهاتف أو كلمة المرور غير صحيحة." };
  }

  redirect("/dashboard");
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const supabase = await createClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
  });

  // لا نُفصح إن كان البريد مسجلًا أم لا لمنع تسريب معلومات الحسابات.
  if (error && error.status !== 400) return { error: "تعذّر إرسال رابط إعادة التعيين." };
  return { success: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
