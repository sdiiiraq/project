'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { apiClient, ApiClientError } from '@/lib/api-client';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async () => {
    if (newPassword.length < 10) { setErrorMsg('كلمة المرور 10 أحرف على الأقل'); return; }
    if (!token) { setErrorMsg('رابط إعادة التعيين غير صالح'); return; }
    setStatus('saving');
    try {
      await apiClient.auth.resetPassword({ token, newPassword });
      setStatus('done');
      setTimeout(() => router.push('/login'), 1500);
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof ApiClientError ? e.message : 'حدث خطأ');
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader><CardTitle>إعادة تعيين كلمة المرور</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {status === 'done' ? (
          <p className="text-sm text-green-700">تم إعادة تعيين كلمة المرور، جارٍ التحويل لتسجيل الدخول...</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="newPassword">كلمة المرور الجديدة</Label>
              <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            <Button onClick={submit} className="w-full" disabled={status === 'saving'}>
              {status === 'saving' ? 'جارٍ الحفظ...' : 'إعادة التعيين'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div dir="rtl" lang="ar" className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Suspense fallback={<div className="text-muted-foreground">جارٍ التحميل...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
