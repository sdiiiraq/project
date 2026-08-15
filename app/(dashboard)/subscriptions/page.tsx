import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/utils/money";
import { FileText } from "lucide-react";
import type { SubscriptionStatus } from "@prisma/client";

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  ACTIVE: "فعّال",
  PENDING: "قيد الانتظار",
  OVERDUE: "متأخر",
  SUSPENDED: "موقوف",
  CANCELLED: "ملغى",
  EXPIRED: "منتهي",
};

export default async function SubscriptionsPage() {
  const { workspace, role, permissions } = await requireWorkspace();
  requirePermission(permissions, "subscriptions.read");

  const subscriptions = await db.customerSubscription.findMany({
    where: { customer: { workspaceId: workspace.id, deletedAt: null } },
    include: { customer: true, amperePlan: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الاشتراكات</h1>
        <p className="text-sm text-muted-foreground">{subscriptions.length} اشتراك</p>
      </div>

      {subscriptions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد اشتراكات بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {subscriptions.map((sub) => (
            <Link key={sub.id} href={`/customers/${sub.customerId}`}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{sub.customer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sub.amperes} أمبير — {formatMoney(Number(sub.price))} شهريًا
                    </p>
                  </div>
                  <Badge variant={sub.status === "ACTIVE" ? "success" : sub.status === "OVERDUE" ? "warning" : "secondary"}>
                    {STATUS_LABELS[sub.status]}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
