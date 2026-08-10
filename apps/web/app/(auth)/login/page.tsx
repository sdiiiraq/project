'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { createT } from '@/i18n';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { useState } from 'react';

const schema = z.object({
  phone: z.string().regex(/^07\d{9}$/, 'رقم الهاتف غير صحيح'),
  password: z.string().min(10, 'كلمة المرور 10 أحرف على الأقل'),
});
type LoginForm = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const t = createT();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    try {
      await login(data.phone, data.password);
      router.push('/dashboard');
    } catch (e) {
      if (e instanceof ApiClientError) setServerError(e.code === 'INVALID_CREDENTIALS' ? t('auth.loginError') : e.message);
      else setServerError('حدث خطأ غير متوقع');
    }
  };

  return (
    <div dir="rtl" lang="ar" className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-center text-primary">{t('common.appName')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">{t('auth.phone')}</Label>
              <Input id="phone" inputMode="numeric" autoComplete="tel" {...register('phone')} />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            {serverError && <p className="text-sm text-destructive">{serverError}</p>}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'جارٍ تسجيل الدخول...' : t('auth.login')}
            </Button>
            <div className="text-center">
              <Link href="/forgot-password" className="text-sm text-primary hover:underline">{t('auth.forgotPassword')}</Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
