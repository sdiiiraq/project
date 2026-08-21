"use client";

import { useEffect } from "react";

// آخر خط دفاع: يلتقط الأخطاء التي تقع في التخطيط الجذري نفسه، حيث لا تعمل error.tsx
// الخاصة بالمجموعات. يجب أن يتضمن <html> و<body> لأنه يستبدل التخطيط الجذري بالكامل.
//
// لا يعتمد على أي مكوّن من مكوّنات المشروع عمدًا: إذا كان سبب الانهيار في طبقة الواجهة
// المشتركة، فاستيرادها هنا سيُسقط صفحة الخطأ نفسها.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(JSON.stringify({ level: "error", event: "app.global_error", digest: error.digest }));
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0b0b0c",
          color: "#f5f5f5",
          padding: "1rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.75rem" }}>حدث خطأ غير متوقع</h1>
          <p style={{ fontSize: "0.9rem", opacity: 0.8, lineHeight: 1.7, marginBottom: "1.5rem" }}>
            تعذّر تحميل التطبيق. حاول مرة أخرى، وإذا تكررت المشكلة تواصل مع الدعم الفني.
          </p>
          {error.digest && (
            <p style={{ fontSize: "0.75rem", opacity: 0.5, marginBottom: "1.5rem" }}>
              رمز الخطأ: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              background: "#f5f5f5",
              color: "#0b0b0c",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.6rem 1.5rem",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  );
}
