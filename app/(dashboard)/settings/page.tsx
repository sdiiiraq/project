import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GeneratorSettingsForm } from "./generator-settings-form";
import { AmperePricingSettingsForm } from "./ampere-plans-settings-form";
import { AddEmployeeDialog } from "@/components/settings/add-employee-dialog";
import { EditEmployeePermissionsDialog } from "@/components/settings/edit-employee-permissions-dialog";
import { InstallAppCard } from "@/components/pwa/install-app-card";
import { permissionLabel } from "@/lib/rbac/permission-groups";
import type { PermissionKey } from "@/lib/rbac/permissions";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "المالك",
  EMPLOYEE: "موظف",
};

export default async function SettingsPage() {
  const { workspace, permissions } = await requireWorkspace();
  requirePermission(permissions, "settings.manage");

  const [generator, ws, members] = await Promise.all([
    db.generator.findFirst({ where: { workspaceId: workspace.id } }),
    db.workspace.findUnique({ where: { id: workspace.id }, select: { normalAmperePriceIQD: true, goldAmperePriceIQD: true } }),
    db.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: { user: true, permissions: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const canManageTeam = roleHasPermission(permissions, "team.manage");
  const actorPermissions = Array.from(permissions);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الإعدادات</h1>
        <p className="text-sm text-muted-foreground">إدارة بيانات المولدة، أسعار الأمبير، وفريق العمل.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>معلومات المولدة</CardTitle>
          <CardDescription>هذه البيانات تظهر في التقارير والفواتير.</CardDescription>
        </CardHeader>
        <CardContent>
          <GeneratorSettingsForm
            defaultValues={{
              ownerName: generator?.ownerName ?? "",
              phone: generator?.phone ?? "",
              region: generator?.region ?? workspace.region ?? "",
              address: generator?.address ?? workspace.address ?? "",
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>أسعار الأمبير</CardTitle>
          <CardDescription>حدد سعر الأمبير العادي والذهبي، ويُحسب اشتراك كل مشترك تلقائيًا حسب نوعه وعدد أمبيراته.</CardDescription>
        </CardHeader>
        <CardContent>
          <AmperePricingSettingsForm
            initialNormalPrice={Number(ws?.normalAmperePriceIQD ?? 0)}
            initialGoldPrice={Number(ws?.goldAmperePriceIQD ?? 0)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>فريق العمل</CardTitle>
            <CardDescription>الأعضاء الذين يملكون صلاحية الوصول إلى هذه المولدة، وصلاحيات كل واحد منهم.</CardDescription>
          </div>
          {canManageTeam && <AddEmployeeDialog actorPermissions={actorPermissions as PermissionKey[]} />}
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {members.map((member) => {
            const memberPermissions = member.permissions.map((p) => p.permissionKey as PermissionKey);
            return (
              <div key={member.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{member.user.fullName}</p>
                    <p className="text-xs text-muted-foreground">{member.user.email ?? member.user.phone}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{ROLE_LABELS[member.role] ?? member.role}</Badge>
                    {canManageTeam && member.role === "EMPLOYEE" && (
                      <EditEmployeePermissionsDialog
                        memberId={member.id}
                        employeeName={member.user.fullName}
                        currentPermissions={memberPermissions}
                        actorPermissions={actorPermissions as PermissionKey[]}
                      />
                    )}
                  </div>
                </div>
                {member.role === "EMPLOYEE" && (
                  <p className="text-xs text-muted-foreground">
                    {memberPermissions.length > 0
                      ? memberPermissions.map((p) => permissionLabel(p)).join("، ")
                      : "لا توجد صلاحيات ممنوحة بعد"}
                  </p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <InstallAppCard />
    </div>
  );
}
