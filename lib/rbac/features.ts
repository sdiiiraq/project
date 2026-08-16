import "server-only";
import { db } from "@/lib/db";

// طبقة تجريد للـ Feature Flags: Plan Feature + Workspace Override، والـ Override له الأولوية.
export async function canUseFeature(workspaceId: string, featureKey: string): Promise<boolean> {
  const override = await db.workspaceFeatureOverride.findUnique({
    where: { workspaceId_featureKey: { workspaceId, featureKey } },
  });
  if (override) return override.enabled;

  const subscription = await db.platformSubscription.findUnique({
    where: { workspaceId },
    include: { plan: { include: { features: { where: { featureKey } } } } },
  });

  // لا يوجد اشتراك منصّة بعد لهذا Workspace — الوصول مفتوح افتراضيًا حتى يُفعَّل نظام الباقات له.
  if (!subscription) return true;

  return subscription.plan.features[0]?.enabled ?? false;
}

export async function canUseLimit(
  workspaceId: string,
  metric: "customers" | "users",
  currentCount: number,
): Promise<{ allowed: boolean; limit: number | null }> {
  const subscription = await db.platformSubscription.findUnique({
    where: { workspaceId },
    include: { plan: true },
  });

  if (!subscription) return { allowed: true, limit: null };

  const limitMap: Record<typeof metric, number | null> = {
    customers: subscription.plan.customerLimit,
    users: subscription.plan.userLimit,
  } as const;

  const limit = limitMap[metric];
  if (limit === null || limit === undefined) return { allowed: true, limit: null };

  return { allowed: currentCount < limit, limit };
}
