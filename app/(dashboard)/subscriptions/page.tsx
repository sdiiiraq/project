import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHelp } from "@/components/help/page-help";
import { Pagination } from "@/components/shared/pagination";
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

const PAGE_SIZE = 20;

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const { workspace, permissions } = await requireWorkspace();
  requirePermission(permissions, "subscriptions.read");

  const page = Math.max(1, Number(pageParam) || 1);

  // كانت الصفحة تُحمّل كل اشتراكات المولدة دفعة واحدة مع join مزدوج وبلا أي حد.
  const where = { customer: { workspaceId: workspace.id, deletedAt: null } };
  const [total, subscriptions] = await Promise.all([
    db.customerSubscription.count({ where }),
    db.customerSubscription.findMany({
      where,
      select: {
        id: true,
        customerId: true,
        amperes: true,
        price: true,
        status: true,
        customer: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الاشتراكات</h1>
          <p className="text-sm text-muted-foreground">{total} اشتراك</p>
        </div>
        <PageHelp pageKey="subscriptions" />
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

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/subscriptions" searchParams={{}} />
    </div>
  );
}
