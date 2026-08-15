"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60svh] items-center justify-center p-4">
      <Card className="max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="font-semibold">حدث خطأ غير متوقع</p>
          <p className="text-sm text-muted-foreground">
            تعذّر تحميل هذه الصفحة. حاول مرة أخرى، وإذا تكررت المشكلة تواصل مع الدعم الفني.
          </p>
          <Button onClick={reset}>إعادة المحاولة</Button>
        </CardContent>
      </Card>
    </div>
  );
}
