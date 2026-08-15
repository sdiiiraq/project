import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChangeStatusSelect } from "@/components/admin/change-status-select";
import { ChangePlanDialog } from "@/components/admin/change-plan-dialog";
import { ExtendTrialDialog } from "@/components/admin/extend-trial-dialog";
import { AddCreditDialog } from "@/components/admin/add-credit-dialog";
import { FeatureOverrideToggle } from "@/components/admin/feature-override-toggle";
import { ImpersonateButton } from "@/components/admin/impersonate-button";
import { formatMoney } from "@/lib/utils/money";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ar-IQ", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "المالك", ADMIN: "مدير", ACCOUNTANT: "محاسب", COLLECTOR: "جابي", MAINTENANCE: "صيانة", VIEWER: "مشاهد",
};

export default async function AdminWorkspaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const workspace = await db.workspace.findUnique({
    where: { id },
    include: {
      owner: true,
      members: { include: { user: true } },
      generators: true,
      platformSubscription: { include: { plan: { include: { features: true } }, transactions: { orderBy: { createdAt: "desc" }, take: 5 } } },
      featureOverrides: true,
      _count: { select: { customers: true } },
    },
  });
  if (!workspace) notFound();

  const [allPlans, allFeatures, auditLogs] = await Promise.all([
    db.platformPlan.findMany({ where: { isActive: true }, orderBy: { price: "asc" } }),
    db.feature.findMany(),
    db.auditLog.findMany({ where: { workspaceId: id }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);

  const enabledFeatureKeys = new Set(workspace.platformSubscription?.plan.features.filter((f) => f.enabled).map((f) => f.featureKey));
  const overrideMap = new Map(workspace.featureOverrides.map((o) => [o.featureKey, o.enabled]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{workspace.name}</h1>
          <p className="text-sm text-muted-foreground">أُنشئت في {formatDate(workspace.createdAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          <ImpersonateButton workspaceId={workspace.id} />
          <ChangeStatusSelect workspaceId={workspace.id} status={workspace.status} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">نظرة عامة</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <p>المالك: {workspace.owner.fullName}</p>
            <p className="text-muted-foreground">{workspace.owner.email ?? workspace.owner.phone}</p>
            <p>المولدة: {workspace.generators[0]?.name ?? "—"}</p>
            <p>عدد المشتركين: {workspace._count.customers}</p>
            <p>عدد المستخدمين: {workspace.members.length}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">الاشتراك والباقة</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {workspace.platformSubscription ? (
              <>
                <p>الباقة: {workspace.platformSubscription.plan.name}</p>
                <p>الحالة: <Badge variant={workspace.platformSubscription.status === "ACTIVE" ? "success" : "secondary"}>{workspace.platformSubscription.status}</Badge></p>
                <p>السعر: {formatMoney(Number(workspace.platformSubscription.price))}</p>
                {workspace.platformSubscription.trialEnd && (
                  <p className="text-muted-foreground">نهاية التجربة: {formatDate(workspace.platformSubscription.trialEnd)}</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">لا يوجد اشتراك منصّة بعد</p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              <ChangePlanDialog
                workspaceId={workspace.id}
                plans={allPlans.map((p) => ({ id: p.id, name: p.name, price: Number(p.price) }))}
                currentPlanId={workspace.platformSubscription?.planId}
              />
              <ExtendTrialDialog workspaceId={workspace.id} />
              <AddCreditDialog workspaceId={workspace.id} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">آخر معاملات الفوترة</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {!workspace.platformSubscription || workspace.platformSubscription.transactions.length === 0 ? (
              <p className="text-muted-foreground">لا توجد معاملات بعد</p>
            ) : (
              workspace.platformSubscription.transactions.map((t) => (
                <div key={t.id} className="flex justify-between">
                  <span>{t.type}</span>
                  <span>{formatMoney(Number(t.amount))}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">المستخدمون</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {workspace.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2 text-sm">
              <span>{m.user.fullName}</span>
              <Badge variant="secondary">{ROLE_LABELS[m.role] ?? m.role}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">الميزات (Plan Feature + Workspace Override)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {allFeatures.map((feature) => {
            const override = overrideMap.get(feature.key);
            const enabled = override ?? enabledFeatureKeys.has(feature.key);
            return (
              <FeatureOverrideToggle
                key={feature.key}
                workspaceId={workspace.id}
                featureKey={feature.key}
                featureName={feature.name}
                enabled={enabled}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">سجل النشاط</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {auditLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد نشاط مسجّل بعد</p>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between text-sm">
                <span>{log.action}</span>
                <span className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
