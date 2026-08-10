'use client';

import { useState } from 'react';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui/core';
import { apiClient, ApiClientError } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async () => {
    if (!/^07\d{9}$/.test(phone)) { setErrorMsg('رقم الهاتف غير صحيح'); return; }
    setStatus('sending');
    try {
      await apiClient.auth.forgotPassword({ phone });
      setStatus('sent');
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof ApiClientError ? e.message : 'حدث خطأ');
    }
  };

  return (
    <div dir="rtl" lang="ar" className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md">
        <CardHeader><CardTitle>نسيت كلمة المرور؟</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {status === 'sent' ? (
            <p className="text-sm text-green-700">إذا كان الرقم مسجلاً فستصلك تعليمات إعادة التعيين.</p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input id="phone" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
              <Button onClick={submit} className="w-full" disabled={status === 'sending'}>
                {status === 'sending' ? 'جارٍ الإرسال...' : 'إرسال'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
