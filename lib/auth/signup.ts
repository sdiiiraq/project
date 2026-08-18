import "server-only";

import type { AuthError } from "@supabase/supabase-js";
import type { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { db } from "@/lib/db";
import { normalizeIraqiPhone } from "@/lib/utils/phone";
import { signupEmailSchema, signupPhoneSchema } from "@/lib/validation/auth";

export type SignupField =
  | "fullName"
  | "email"
  | "phone"
  | "password"
  | "confirmPassword"
  | "generatorName";

// جسم الخطأ المُعاد للعميل — دائمًا مع رمز واضح وسبب تقني للتشخيص.
export type SignupErrorBody = {
  error: string;
  code: string;
  field?: SignupField;
  fields?: Partial<Record<SignupField, string>>;
  details?: string;
};

export type SignupFailure = { ok: false; status: number; body: SignupErrorBody };
export type SignupSuccess = { ok: true; status: 201; body: { success: true; redirectTo: string } };
export type SignupResult = SignupSuccess | SignupFailure;

function fail(status: number, body: SignupErrorBody): SignupFailure {
  return { ok: false, status, body };
}

function zodFailure(error: z.ZodError): SignupFailure {
  const fields: Partial<Record<SignupField, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as SignupField | undefined;
    if (field && !fields[field]) fields[field] = issue.message;
  }
  const first = error.issues[0];
  return fail(400, {
    error: first?.message ?? "بيانات غير صحيحة",
    code: "validation_error",
    field: first?.path[0] as SignupField | undefined,
    fields,
    details: error.issues.map((i) => `${i.path.join(".") || "_"}: ${i.message}`).join(" | "),
  });
}

// يحوّل خطأ Supabase إلى رسالة عربية واضحة + رمز HTTP مناسب بدل 200 مبهم.
export function mapSupabaseAuthError(error: AuthError): SignupFailure {
  const code = error.code ?? "";
  const raw = error.message ?? "";
  const message = raw.toLowerCase();
  const details = code ? `${code}: ${raw}` : raw;

  if (
    ["user_already_exists", "email_exists", "phone_exists"].includes(code) ||
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("already been registered")
  ) {
    return fail(409, {
      error: "هذا البريد الإلكتروني أو رقم الهاتف مسجّل مسبقًا. سجّل الدخول أو استخدم بيانات أخرى.",
      code: "user_already_exists",
      field: message.includes("phone") ? "phone" : "email",
      details,
    });
  }

  if (code === "weak_password" || message.includes("password should") || message.includes("password is too")) {
    return fail(400, {
      error: `كلمة المرور ضعيفة جدًا: ${raw}`,
      code: "weak_password",
      field: "password",
      details,
    });
  }

  if (code === "email_address_invalid" || message.includes("invalid email")) {
    return fail(400, {
      error: "البريد الإلكتروني غير صحيح أو مرفوض من مزوّد البريد.",
      code: "email_address_invalid",
      field: "email",
      details,
    });
  }

  if (code === "phone_number_invalid" || message.includes("invalid phone")) {
    return fail(400, {
      error: "رقم الهاتف غير صحيح. استخدم الصيغة 07XXXXXXXXX.",
      code: "phone_number_invalid",
      field: "phone",
      details,
    });
  }

  if (code === "signup_disabled" || code === "email_provider_disabled" || code === "phone_provider_disabled") {
    return fail(503, {
      error: "التسجيل معطّل حاليًا من إعدادات المنصّة. راجع الدعم الفني.",
      code: code || "signup_disabled",
      details,
    });
  }

  if (code.startsWith("over_") || error.status === 429 || message.includes("rate limit")) {
    return fail(429, {
      error: "محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم أعد المحاولة.",
      code: code || "rate_limit_exceeded",
      details,
    });
  }

  // لا نُخفي السبب الحقيقي — نعرضه مع رمز HTTP صحيح.
  const status = error.status && error.status >= 400 && error.status < 500 ? 400 : 502;
  return fail(status, {
    error: `تعذّر إنشاء الحساب: ${raw || "خطأ غير معروف من خدمة المصادقة"}`,
    code: code || "auth_error",
    details,
  });
}

function missingSupabaseEnv(options?: { serviceRole?: boolean }): string[] {
  const keys = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  if (options?.serviceRole) keys.push("SUPABASE_SERVICE_ROLE_KEY");
  return keys.filter((key) => !process.env[key]);
}

function envFailure(missing: string[]): SignupFailure {
  console.error("[signup] missing environment variables", missing);
  return fail(500, {
    error: "إعدادات الخادم غير مكتملة. راجع الدعم الفني.",
    code: "supabase_not_configured",
    details: `missing env: ${missing.join(", ")}`,
  });
}

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

async function provision(params: Parameters<typeof createWorkspaceForNewUser>[0]): Promise<SignupResult> {
  try {
    await createWorkspaceForNewUser(params);
  } catch (error) {
    console.error("[signup] workspace provisioning failed", error);
    return fail(500, {
      error: "تم إنشاء الحساب لكن تعذّر تجهيز مساحة العمل. راجع الدعم الفني.",
      code: "workspace_provisioning_failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
  return { ok: true, status: 201, body: { success: true, redirectTo: "/onboarding" } };
}

// عند تفعيل تأكيد البريد، يُعيد Supabase مستخدمًا وهميًا (identities فارغة) بدل خطأ صريح
// لإخفاء وجود الحساب. نعتبره "مسجّل مسبقًا" بدل تجهيز مساحة عمل لحساب غير حقيقي.
function isObfuscatedExistingUser(user: { identities?: unknown[] | null }): boolean {
  return Array.isArray(user.identities) && user.identities.length === 0;
}

function alreadyRegisteredFailure(field: SignupField): SignupFailure {
  return fail(409, {
    error: "هذا البريد الإلكتروني أو رقم الهاتف مسجّل مسبقًا. سجّل الدخول أو استخدم بيانات أخرى.",
    code: "user_already_exists",
    field,
    details: "supabase returned an obfuscated user (empty identities)",
  });
}

function noUserFailure(): SignupFailure {
  return fail(502, {
    error: "لم تُرجع خدمة المصادقة أي مستخدم. حاول مرة أخرى.",
    code: "no_user_returned",
  });
}

export async function signupWithEmail(input: unknown): Promise<SignupResult> {
  const parsed = signupEmailSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error);

  const missing = missingSupabaseEnv();
  if (missing.length > 0) return envFailure(missing);

  const { fullName, email, password, generatorName } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error) {
    console.error("[signup] supabase signUp (email) failed", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    return mapSupabaseAuthError(error);
  }
  if (!data.user) return noUserFailure();
  if (isObfuscatedExistingUser(data.user)) return alreadyRegisteredFailure("email");

  return provision({ userId: data.user.id, fullName, email, phone: null, generatorName });
}

// التسجيل بالهاتف = رقم + كلمة مرور فقط. لا رمز تحقق ولا SMS: نُنشئ المستخدم عبر Admin API
// مع phone_confirm حتى لا يحاول Supabase إرسال OTP، ثم نفتح الجلسة بكلمة المرور مباشرة.
export async function signupWithPhone(input: unknown): Promise<SignupResult> {
  const parsed = signupPhoneSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error);

  const missing = missingSupabaseEnv({ serviceRole: true });
  if (missing.length > 0) return envFailure(missing);

  const { fullName, phone, password, generatorName } = parsed.data;
  const normalizedPhone = normalizeIraqiPhone(phone);

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    phone: normalizedPhone,
    password,
    phone_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) {
    console.error("[signup] supabase admin createUser (phone) failed", {
      code: error.code,
      status: error.status,
      message: error.message,
    });
    return mapSupabaseAuthError(error);
  }
  if (!data.user) return noUserFailure();

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    phone: normalizedPhone,
    password,
  });

  if (signInError) {
    console.error("[signup] sign-in after phone signup failed", {
      code: signInError.code,
      status: signInError.status,
      message: signInError.message,
    });
    return mapSupabaseAuthError(signInError);
  }

  return provision({ userId: data.user.id, fullName, email: null, phone: normalizedPhone, generatorName });
}
