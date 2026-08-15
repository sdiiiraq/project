"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  signupEmailSchema,
  signupPhoneSchema,
  type SignupEmailInput,
  type SignupPhoneInput,
} from "@/lib/validation/auth";
import { signUpWithEmail, signUpWithPhone } from "@/lib/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function EmailSignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupEmailInput>({ resolver: zodResolver(signupEmailSchema) });

  async function onSubmit(values: SignupEmailInput) {
    setServerError(null);
    setLoading(true);
    const result = await signUpWithEmail(values);
    setLoading(false);
    if (result && "error" in result) setServerError(result.error);
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
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupPhoneInput>({ resolver: zodResolver(signupPhoneSchema) });

  async function onSubmit(values: SignupPhoneInput) {
    setServerError(null);
    setLoading(true);
    const result = await signUpWithPhone(values);
    setLoading(false);
    if (result && "error" in result) setServerError(result.error);
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
