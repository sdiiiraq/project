"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from "@/lib/theme";

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTheme(getStoredTheme());
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    applyTheme(next);
    setStoredTheme(next);
  }

  // نتجنب عرض حالة غير مؤكدة قبل قراءة التفضيل المحفوظ من localStorage.
  if (!mounted) return <div className={className} aria-hidden="true" />;

  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === "light" ? "التبديل إلى الوضع الليلي" : "التبديل إلى الوضع النهاري"}
      aria-label={theme === "light" ? "التبديل إلى الوضع الليلي" : "التبديل إلى الوضع النهاري"}
      className={className ?? "flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"}
    >
      {theme === "light" ? <Moon className="h-[18px] w-[18px]" /> : <Sun className="h-[18px] w-[18px]" />}
    </button>
  );
}
