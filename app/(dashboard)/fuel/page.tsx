import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateFuelPurchaseDialog } from "@/components/fuel/create-fuel-purchase-dialog";
import { CreateFuelUsageDialog } from "@/components/fuel/create-fuel-usage-dialog";
import { formatMoney } from "@/lib/utils/money";
import { Fuel } from "lucide-react";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ar-IQ", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export default async function FuelPage() {
  const { workspace, role } = await requireWorkspace();
  requirePermission(role, "fuel.read");

  const [purchases, usages, purchaseAgg, usageAgg] = await Promise.all([
    db.fuelPurchase.findMany({ where: { workspaceId: workspace.id }, orderBy: { date: "desc" }, take: 20 }),
    db.fuelUsage.findMany({ where: { workspaceId: workspace.id }, orderBy: { date: "desc" }, take: 20 }),
    db.fuelPurchase.aggregate({ where: { workspaceId: workspace.id }, _sum: { quantityLiters: true, totalCost: true } }),
    db.fuelUsage.aggregate({ where: { workspaceId: workspace.id }, _sum: { quantityLiters: true } }),
  ]);

  const currentStock = Number(purchaseAgg._sum.quantityLiters ?? 0) - Number(usageAgg._sum.quantityLiters ?? 0);
  const canCreate = roleHasPermission(role, "fuel.create");

  const events = [
    ...purchases.map((p) => ({ id: p.id, date: p.date, type: "شراء" as const, quantity: Number(p.quantityLiters), cost: Number(p.totalCost) })),
    ...usages.map((u) => ({ id: u.id, date: u.date, type: "استهلاك" as const, quantity: Number(u.quantityLiters), cost: null })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">الوقود</h1>
          <p className="text-sm text-muted-foreground">المخزون الحالي: {currentStock.toLocaleString("ar-IQ")} لتر</p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <CreateFuelUsageDialog />
            <CreateFuelPurchaseDialog />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">المخزون الحالي</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{currentStock.toLocaleString("ar-IQ")} لتر</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي المشتريات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatMoney(Number(purchaseAgg._sum.totalCost ?? 0))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي الاستهلاك</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{Number(usageAgg._sum.quantityLiters ?? 0).toLocaleString("ar-IQ")} لتر</p>
          </CardContent>
        </Card>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Fuel className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد سجلات وقود بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((event) => (
            <Card key={`${event.type}-${event.id}`}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium">{event.type} — {event.quantity.toLocaleString("ar-IQ")} لتر</p>
                  <p className="text-xs text-muted-foreground">{formatDate(event.date)}</p>
                </div>
                {event.cost !== null && <span className="font-semibold">{formatMoney(event.cost)}</span>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
