"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type UseFormSetError, type FieldValues, type Path } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  signupEmailSchema,
  signupPhoneSchema,
  type SignupEmailInput,
  type SignupPhoneInput,
} from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type SignupErrorBody = {
  error?: string;
  code?: string;
  field?: string;
  fields?: Record<string, string>;
  details?: string;
};

// يرسل الطلب إلى /api/auth/signup ويعيد الخطأ كما هو (برمز حالة حقيقي) بدل ابتلاعه.
async function submitSignup<T extends FieldValues>(
  mode: "email" | "phone",
  values: T,
  setError: UseFormSetError<T>,
): Promise<{ redirectTo: string } | { message: string | null }> {
  let response: Response;
  try {
    response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, mode }),
    });
  } catch {
    return { message: "تعذّر الاتصال بالخادم. تحقّق من الإنترنت وحاول مرة أخرى." };
  }

  const body = (await response.json().catch(() => null)) as (SignupErrorBody & { redirectTo?: string }) | null;

  if (response.ok) {
    return { redirectTo: body?.redirectTo ?? "/onboarding" };
  }

  // أخطاء الحقول تُعرض تحت الحقل نفسه؛ الباقي في شريط أعلى الزر.
  const fieldErrors = body?.fields ?? (body?.field && body?.error ? { [body.field]: body.error } : null);
  const handledFields = Object.entries(fieldErrors ?? {}).filter(([field]) => field in values);
  for (const [field, message] of handledFields) {
    setError(field as Path<T>, { type: "server", message });
  }

  if (handledFields.length > 0) return { message: null };

  const base = body?.error ?? `فشل الطلب (${response.status} ${response.statusText}).`;
  return { message: body?.code ? `${base} [${body.code}]` : base };
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function EmailSignupForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignupEmailInput>({ resolver: zodResolver(signupEmailSchema) });

  async function onSubmit(values: SignupEmailInput) {
    setServerError(null);
    setLoading(true);
    const result = await submitSignup("email", values, setError);
    if ("redirectTo" in result) {
      router.replace(result.redirectTo);
      router.refresh();
      return;
    }
    setLoading(false);
    setServerError(result.message);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullName">الاسم الثلاثي</Label>
        <Input id="fullName" placeholder="مثال: أحمد محمد علي" {...register("fullName")} />
        <FieldError message={errors.fullName?.message} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <Input id="email" type="email" {...register("email")} />
        <FieldError message={errors.email?.message} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="generatorName">اسم المولدة</Label>
        <Input id="generatorName" {...register("generatorName")} />
        <FieldError message={errors.generatorName?.message} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password">كلمة المرور</Label>
          <Input id="password" type="password" {...register("password")} />
          <FieldError message={errors.password?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPassword">تأكيد كلمة المرور</Label>
          <Input id="confirmPassword" type="password" {...register("confirmPassword")} />
          <FieldError message={errors.confirmPassword?.message} />
        </div>
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
      </Button>
    </form>
  );
}

function PhoneSignupForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignupPhoneInput>({ resolver: zodResolver(signupPhoneSchema) });

  async function onSubmit(values: SignupPhoneInput) {
    setServerError(null);
    setLoading(true);
    const result = await submitSignup("phone", values, setError);
    if ("redirectTo" in result) {
      router.replace(result.redirectTo);
      router.refresh();
      return;
    }
    setLoading(false);
    setServerError(result.message);
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="fullNamePhone">الاسم الثلاثي</Label>
        <Input id="fullNamePhone" placeholder="مثال: أحمد محمد علي" {...register("fullName")} />
        <FieldError message={errors.fullName?.message} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="phone">رقم الهاتف</Label>
        <Input id="phone" placeholder="07xxxxxxxxx" dir="ltr" {...register("phone")} />
        <FieldError message={errors.phone?.message} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="generatorNamePhone">اسم المولدة</Label>
        <Input id="generatorNamePhone" {...register("generatorName")} />
        <FieldError message={errors.generatorName?.message} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="passwordPhone">كلمة المرور</Label>
          <Input id="passwordPhone" type="password" {...register("password")} />
          <FieldError message={errors.password?.message} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="confirmPasswordPhone">تأكيد كلمة المرور</Label>
          <Input id="confirmPasswordPhone" type="password" {...register("confirmPassword")} />
          <FieldError message={errors.confirmPassword?.message} />
        </div>
      </div>
      {serverError && <p className="text-sm text-destructive">{serverError}</p>}
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "جارٍ الإنشاء..." : "إنشاء الحساب"}
      </Button>
    </form>
  );
}

export function SignupForm() {
  return (
    <Tabs defaultValue="email">
      <TabsList className="w-full">
        <TabsTrigger value="email">البريد الإلكتروني</TabsTrigger>
        <TabsTrigger value="phone">رقم الهاتف</TabsTrigger>
      </TabsList>
      <TabsContent value="email">
        <EmailSignupForm />
      </TabsContent>
      <TabsContent value="phone">
        <PhoneSignupForm />
      </TabsContent>
    </Tabs>
  );
}
