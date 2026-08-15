import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GeneratorSettingsForm } from "./generator-settings-form";
import { AmperePricingSettingsForm } from "./ampere-plans-settings-form";

const ROLE_LABELS: Record<string, string> = {
  OWNER: "المالك",
  ADMIN: "مدير",
  ACCOUNTANT: "محاسب",
  COLLECTOR: "جابي",
  MAINTENANCE: "صيانة",
  VIEWER: "مشاهد",
};

export default async function SettingsPage() {
  const { workspace, role } = await requireWorkspace();
  requirePermission(role, "settings.manage");

  const [generator, ws, members] = await Promise.all([
    db.generator.findFirst({ where: { workspaceId: workspace.id } }),
    db.workspace.findUnique({ where: { id: workspace.id }, select: { normalAmperePriceIQD: true, goldAmperePriceIQD: true } }),
    db.workspaceMember.findMany({ where: { workspaceId: workspace.id }, include: { user: true }, orderBy: { createdAt: "asc" } }),
  ]);

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
        <CardHeader>
          <CardTitle>فريق العمل</CardTitle>
          <CardDescription>الأعضاء الذين يملكون صلاحية الوصول إلى هذه المولدة.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium">{member.user.fullName}</p>
                <p className="text-xs text-muted-foreground">{member.user.email ?? member.user.phone}</p>
              </div>
              <Badge variant="secondary">{ROLE_LABELS[member.role] ?? member.role}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
