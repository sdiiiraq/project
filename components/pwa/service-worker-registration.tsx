"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // التسجيل ليس حرجًا لعمل التطبيق — نتجاهل الفشل بصمت (مثلًا على http غير آمن أثناء التطوير).
      });
    }
  }, []);

  return null;
}
