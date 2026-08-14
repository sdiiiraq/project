"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { isEmail, normalizeIraqiPhone } from "@/lib/utils/phone";
import {
  forgotPasswordSchema,
  loginSchema,
  signupEmailSchema,
  signupPhoneSchema,
} from "@/lib/validation/auth";

export type ActionResult = { error: string } | { success: true };

async function createWorkspaceForNewUser(params: {
  userId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  generatorName: string;
}) {
  await db.$transaction(async (tx) => {
    await tx.user.upsert({
      where: { id: params.userId },
      update: { fullName: params.fullName, email: params.email ?? undefined, phone: params.phone ?? undefined },
      create: { id: params.userId, fullName: params.fullName, email: params.email, phone: params.phone },
    });

    const existing = await tx.workspaceMember.findFirst({ where: { userId: params.userId } });
    if (existing) return;

    const workspace = await tx.workspace.create({
      data: { name: params.generatorName, ownerId: params.userId },
    });

    await tx.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: params.userId, role: "OWNER" },
    });

    await tx.generator.create({
      data: { workspaceId: workspace.id, name: params.generatorName, ownerName: params.fullName },
    });

    const starterPlan = await tx.platformPlan.findFirst({ where: { slug: "starter", isActive: true } });
    if (starterPlan) {
      const trialStart = new Date();
      const trialEnd = new Date(trialStart.getTime() + 14 * 24 * 60 * 60 * 1000);
      await tx.platformSubscription.create({
        data: {
          workspaceId: workspace.id,
          planId: starterPlan.id,
          status: "TRIAL",
          trialStart,
          trialEnd,
          price: starterPlan.price,
        },
      });
    }
  });
}

export async function signUpWithEmail(input: unknown): Promise<ActionResult> {
  const parsed = signupEmailSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  const { fullName, email, password, generatorName } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) return { error: mapSupabaseError(error.message) };
  if (!data.user) return { error: "تعذّر إنشاء الحساب. حاول مرة أخرى." };

  await createWorkspaceForNewUser({
    userId: data.user.id,
    fullName,
    email,
    phone: null,
    generatorName,
  });

  redirect("/onboarding");
}

export async function signUpWithPhone(input: unknown): Promise<ActionResult> {
  const parsed = signupPhoneSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  const { fullName, phone, password, generatorName } = parsed.data;
  const normalizedPhone = normalizeIraqiPhone(phone);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    phone: normalizedPhone,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) return { error: mapSupabaseError(error.message) };
  if (!data.user) return { error: "تعذّر إنشاء الحساب. حاول مرة أخرى." };

  await createWorkspaceForNewUser({
    userId: data.user.id,
    fullName,
    email: null,
    phone: normalizedPhone,
    generatorName,
  });

  redirect("/onboarding");
}

export async function signInWithPassword(input: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  const { identifier, password } = parsed.data;

  const supabase = await createClient();
  const { error } = isEmail(identifier)
    ? await supabase.auth.signInWithPassword({ email: identifier, password })
    : await supabase.auth.signInWithPassword({ phone: normalizeIraqiPhone(identifier), password });

  if (error) return { error: "البريد/الهاتف أو كلمة المرور غير صحيحة." };

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

function mapSupabaseError(message: string): string {
  if (message.includes("already registered") || message.includes("already exists")) {
    return "هذا البريد الإلكتروني أو الرقم مسجل مسبقًا.";
  }
  if (message.includes("Password")) return "كلمة المرور ضعيفة جدًا.";
  return "تعذر تنفيذ العملية. حاول مرة أخرى.";
}
