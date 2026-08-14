import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateEquipmentDialog } from "@/components/maintenance/create-equipment-dialog";
import { CreateMaintenanceDialog } from "@/components/maintenance/create-maintenance-dialog";
import { OperatingSessionControl } from "@/components/maintenance/operating-session-control";
import { formatMoney } from "@/lib/utils/money";
import { Wrench } from "lucide-react";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ar-IQ", { year: "numeric", month: "short", day: "numeric" }).format(date);
}
function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function MaintenancePage() {
  const { workspace, role } = await requireWorkspace();
  requirePermission(role, "maintenance.read");

  const generator = await db.generator.findFirst({ where: { workspaceId: workspace.id } });

  const [equipment, records, openSession, recentSessions] = await Promise.all([
    db.equipment.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "desc" } }),
    db.maintenanceRecord.findMany({
      where: { workspaceId: workspace.id },
      include: { equipment: true },
      orderBy: { date: "desc" },
      take: 20,
    }),
    generator
      ? db.operatingSession.findFirst({ where: { workspaceId: workspace.id, generatorId: generator.id, endTime: null } })
      : null,
    generator
      ? db.operatingSession.findMany({
          where: { workspaceId: workspace.id, generatorId: generator.id, endTime: { not: null } },
          orderBy: { startTime: "desc" },
          take: 10,
        })
      : [],
  ]);

  const canCreate = roleHasPermission(role, "maintenance.create");
  const canOperate = roleHasPermission(role, "generator.manage");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">الصيانة</h1>
          <p className="text-sm text-muted-foreground">{equipment.length} معدة مسجّلة</p>
        </div>
        {canOperate && <OperatingSessionControl openSessionId={openSession?.id ?? null} />}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">جلسات التشغيل الأخيرة</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {recentSessions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">لا توجد جلسات تشغيل مسجّلة بعد</p>
          ) : (
            recentSessions.map((session) => (
              <div key={session.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                <span>{formatDateTime(session.startTime)}</span>
                <span className="text-muted-foreground">
                  {session.operatingHours ? `${Number(session.operatingHours).toFixed(1)} ساعة` : "—"}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
