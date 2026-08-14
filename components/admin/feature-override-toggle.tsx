"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setFeatureOverride } from "@/lib/actions/admin.actions";

export function FeatureOverrideToggle({
  workspaceId,
  featureKey,
  featureName,
  enabled,
}: {
  workspaceId: string;
  featureKey: string;
  featureName: string;
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      const result = await setFeatureOverride({ workspaceId, featureKey, enabled: !enabled });
      if (result && "error" in result) toast.error(result.error);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      className="flex w-full items-center justify-between rounded-lg border p-3 text-sm transition-colors hover:bg-muted disabled:opacity-50"
    >
      <span>{featureName}</span>
      <span className={enabled ? "font-medium text-success" : "font-medium text-muted-foreground"}>
        {enabled ? "مُفعّلة" : "معطّلة"}
      </span>
    </button>
  );
}
