"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { startImpersonation } from "@/lib/actions/impersonation.actions";
import { Button } from "@/components/ui/button";

export function ImpersonateButton({ workspaceId }: { workspaceId: string }) {
  const [loading, setLoading] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        startImpersonation(workspaceId, "دعم فني من لوحة الإدارة");
      }}
    >
      <Eye className="h-4 w-4" /> عرض كـ Admin
    </Button>
  );
}
