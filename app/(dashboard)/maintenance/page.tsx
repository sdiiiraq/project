import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateEquipmentDialog } from "@/components/maintenance/create-equipment-dialog";
import { CreateMaintenanceDialog } from "@/components/maintenance/create-maintenance-dialog";
import { formatMoney } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import { Wrench, ChevronLeft, Zap } from "lucide-react";

export default async function MaintenancePage() {
  const { workspace, permissions } = await requireWorkspace();
  requirePermission(permissions, "maintenance.read");

  const [equipment, records] = await Promise.all([
    db.equipment.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" } }),
    db.maintenanceRecord.findMany({
      where: { workspaceId: workspace.id },
      include: { equipment: true },
      orderBy: { date: "desc" },
      take: 20,
    }),
  ]);

  const canCreate = roleHasPermission(permissions, "maintenance.create");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الصيانة</h1>
        <p className="text-sm text-muted-foreground">{equipment.length} معدة مسجّلة</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">المعدات</CardTitle>
            {canCreate && <CreateEquipmentDialog />}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {equipment.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">لا توجد معدات مسجّلة</p>
            ) : (
              equipment.map((eq) => (
                <div key={eq.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <span className="font-medium">{eq.name}</span>
                  <span className="text-muted-foreground">{eq.model ?? "—"}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm">سجل الصيانة</CardTitle>
            {canCreate && <CreateMaintenanceDialog equipment={equipment.map((e) => ({ id: e.id, name: e.name }))} />}
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {records.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Wrench className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">لا توجد سجلات صيانة بعد</p>
              </div>
            ) : (
              records.map((record) => (
                <div key={record.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">{record.type} — {record.equipment.name}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(record.date)}</p>
                  </div>
                  <span className="font-semibold">{formatMoney(Number(record.cost))}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Link href="/operating-sessions">
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <Zap className="h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium">جلسات التشغيل</p>
            </div>
            <ChevronLeft className="h-4 w-4 text-muted-foreground" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
