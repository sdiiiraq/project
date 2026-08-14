"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function GoogleButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    const supabase = createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${appUrl}/auth/callback` },
    });
  }

  return (
    <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleClick} disabled={loading}>
      <svg viewBox="0 0 24 24" className="h-4 w-4">
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.54-5.17 3.54-8.87z" />
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.15-4.05 1.15-3.11 0-5.75-2.1-6.69-4.92H1.3v3.09A12 12 0 0 0 12 24z" />
        <path fill="#FBBC05" d="M5.31 14.32A7.2 7.2 0 0 1 4.93 12c0-.81.14-1.6.38-2.32V6.59H1.3A12 12 0 0 0 0 12c0 1.94.46 3.77 1.3 5.41z" />
        <path fill="#EA4335" d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.3 6.59l4.01 3.09C6.25 6.86 8.89 4.77 12 4.77z" />
      </svg>
      متابعة باستخدام Google
    </Button>
  );
}
