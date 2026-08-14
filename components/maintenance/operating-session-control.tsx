"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Play, Square } from "lucide-react";
import { startOperatingSession, endOperatingSession } from "@/lib/actions/operations.actions";
import { Button } from "@/components/ui/button";

export function OperatingSessionControl({ openSessionId }: { openSessionId: string | null }) {
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    const result = await startOperatingSession();
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("بدأت جلسة التشغيل");
  }

  async function handleEnd() {
    if (!openSessionId) return;
    setLoading(true);
    const result = await endOperatingSession({ sessionId: openSessionId, downtimeMinutes: 0 });
    setLoading(false);
    if (result && "error" in result) return toast.error(result.error);
    toast.success("تم إنهاء جلسة التشغيل");
  }

  if (openSessionId) {
    return (
      <Button variant="destructive" onClick={handleEnd} disabled={loading}>
        <Square className="h-4 w-4" /> إيقاف تشغيل المولدة
      </Button>
    );
  }

  return (
    <Button onClick={handleStart} disabled={loading}>
      <Play className="h-4 w-4" /> تشغيل المولدة
    </Button>
  );
}
