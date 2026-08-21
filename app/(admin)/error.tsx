"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// لوحة المنصّة كانت بلا حدود خطأ خاصة بها — أي استثناء في صفحاتها كان يصعد إلى
// حد الخطأ الجذري ويُسقط الواجهة بالكامل بدل صفحة الخطأ داخل التخطيط.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", event: "admin.page_error", digest: error.digest }));
  }, [error]);

  return (
    <div className="flex min-h-[60svh] items-center justify-center p-4">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="font-semibold">حدث خطأ غير متوقع</p>
          <p className="text-sm text-muted-foreground">
            تعذّر تحميل هذه الصفحة في لوحة المنصّة. حاول مرة أخرى.
          </p>
          {error.digest && <p className="text-xs text-muted-foreground">رمز الخطأ: {error.digest}</p>}
          <Button onClick={reset}>إعادة المحاولة</Button>
        </CardContent>
      </Card>
    </div>
  );
}
