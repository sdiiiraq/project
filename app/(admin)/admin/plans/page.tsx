import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { PlanFormDialog } from "@/components/admin/plan-form-dialog";
import { formatMoney } from "@/lib/utils/money";

export default async function AdminPlansPage() {
  const plans = await db.platformPlan.findMany({
    include: { _count: { select: { subscriptions: true } } },
    orderBy: { price: "asc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الباقات</h1>
          <p className="text-sm text-muted-foreground">باقات المنصة (Database-driven)</p>
        </div>
        <PlanFormDialog />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id}>
            <CardContent className="flex flex-col gap-2 p-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{plan.name}</p>
                <PlanFormDialog
                  plan={{
                    id: plan.id,
                    slug: plan.slug,
                    name: plan.name,
                    price: Number(plan.price),
                    customerLimit: plan.customerLimit,
                    userLimit: plan.userLimit,
                  }}
                />
              </div>
              <p className="text-2xl font-bold">{formatMoney(Number(plan.price))}</p>
              <p className="text-sm text-muted-foreground">
                {plan.customerLimit ? `${plan.customerLimit} مشترك` : "مشتركين بلا حد"} ·{" "}
                {plan.userLimit ? `${plan.userLimit} مستخدم` : "مستخدمين بلا حد"}
              </p>
              <p className="text-xs text-muted-foreground">{plan._count.subscriptions} مولدة مشتركة</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
