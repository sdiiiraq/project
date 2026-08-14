"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { requestPasswordReset } from "@/lib/actions/auth.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { z } from "zod";

type Input = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Input>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: Input) {
    setLoading(true);
    await requestPasswordReset(values);
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <p className="rounded-lg bg-accent p-4 text-sm text-accent-foreground">
        إذا كان البريد الإلكتروني مسجلًا لدينا، فسيصلك رابط إعادة تعيين كلمة المرور خلال دقائق.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">البريد الإلكتروني</Label>
        <Input id="email" type="email" {...register("email")} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>
      <Button type="submit" size="lg" disabled={loading}>
        {loading ? "جارٍ الإرسال..." : "إرسال رابط إعادة التعيين"}
      </Button>
    </form>
  );
}
