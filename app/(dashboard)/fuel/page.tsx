import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateFuelPurchaseDialog } from "@/components/fuel/create-fuel-purchase-dialog";
import { CreateFuelUsageDialog } from "@/components/fuel/create-fuel-usage-dialog";
import { EditFuelPurchaseDialog } from "@/components/fuel/edit-fuel-purchase-dialog";
import { EditFuelUsageDialog } from "@/components/fuel/edit-fuel-usage-dialog";
import { formatMoney } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import { Fuel } from "lucide-react";

export default async function FuelPage() {
  const { workspace, permissions } = await requireWorkspace();
  requirePermission(permissions, "fuel.read");

  const [purchases, usages, purchaseAgg, usageAgg] = await Promise.all([
    db.fuelPurchase.findMany({ where: { workspaceId: workspace.id }, orderBy: { date: "desc" }, take: 20 }),
    db.fuelUsage.findMany({ where: { workspaceId: workspace.id }, orderBy: { date: "desc" }, take: 20 }),
    db.fuelPurchase.aggregate({ where: { workspaceId: workspace.id }, _sum: { quantityLiters: true, totalCost: true } }),
    db.fuelUsage.aggregate({ where: { workspaceId: workspace.id }, _sum: { quantityLiters: true } }),
  ]);

  const currentStock = Number(purchaseAgg._sum.quantityLiters ?? 0) - Number(usageAgg._sum.quantityLiters ?? 0);
  const canCreate = roleHasPermission(permissions, "fuel.create");
  const canUpdate = roleHasPermission(permissions, "fuel.update");
  const canDelete = roleHasPermission(permissions, "fuel.delete");

  type FuelEvent = {
    id: string;
    date: Date;
    type: "شراء" | "استهلاك";
    quantity: number;
    cost: number | null;
    purchase?: { id: string; quantityLiters: number; pricePerLiter: number; supplier: string | null; date: Date };
    usage?: { id: string; quantityLiters: number; date: Date; note: string | null };
  };

  const events: FuelEvent[] = [
    ...purchases.map((p): FuelEvent => ({
      id: p.id,
      date: p.date,
      type: "شراء",
      quantity: Number(p.quantityLiters),
      cost: Number(p.totalCost),
      purchase: { id: p.id, quantityLiters: Number(p.quantityLiters), pricePerLiter: Number(p.pricePerLiter), supplier: p.supplier, date: p.date },
    })),
    ...usages.map((u): FuelEvent => ({
      id: u.id,
      date: u.date,
      type: "استهلاك",
      quantity: Number(u.quantityLiters),
      cost: null,
      usage: { id: u.id, quantityLiters: Number(u.quantityLiters), date: u.date, note: u.note },
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الوقود</h1>
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
            <p className="text-2xl font-bold tracking-tight md:text-3xl">{currentStock.toLocaleString("ar-IQ")} لتر</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي المشتريات</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight md:text-3xl">{formatMoney(Number(purchaseAgg._sum.totalCost ?? 0))}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي الاستهلاك</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tracking-tight md:text-3xl">{Number(usageAgg._sum.quantityLiters ?? 0).toLocaleString("ar-IQ")} لتر</p>
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
                <div className="flex items-center gap-2">
                  {event.cost !== null && <span className="font-semibold">{formatMoney(event.cost)}</span>}
                  {canUpdate && event.purchase && <EditFuelPurchaseDialog purchase={event.purchase} canDelete={canDelete} />}
                  {canUpdate && event.usage && <EditFuelUsageDialog usage={event.usage} canDelete={canDelete} />}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
