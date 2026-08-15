import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { getDashboardStats } from "@/lib/domain/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { RevenueTrendChart } from "@/components/dashboard/trend-chart";
import { CustomerGrowthChart } from "@/components/dashboard/customer-growth-chart";
import { OperatingSessionControl } from "@/components/maintenance/operating-session-control";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils";
import { Users, Zap, Wallet, TrendingUp, TrendingDown, AlertTriangle, Users2 } from "lucide-react";

function formatTime(date: Date) {
  return new Intl.DateTimeFormat("ar-IQ", { hour: "numeric", minute: "2-digit" }).format(date);
}

export default async function DashboardPage() {
  const { workspace, role } = await requireWorkspace();
  const [generator, stats] = await Promise.all([
    db.generator.findFirst({ where: { workspaceId: workspace.id } }),
    getDashboardStats(workspace.id),
  ]);

  const openSession = generator
    ? await db.operatingSession.findFirst({
        where: { workspaceId: workspace.id, generatorId: generator.id, endTime: null },
      })
    : null;

  const canManageGenerator = roleHasPermission(role, "generator.manage");

  const TONES = {
    primary: "bg-primary/15 text-primary",
    cyan: "bg-cyan/15 text-cyan",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
  } as const;

  const kpis = [
    { label: "مجموع المشتركين", value: String(stats.customerCount), icon: Users, tone: "primary" as const },
    { label: "المشتركين الفعالين", value: String(stats.activeCustomerCount), icon: Users2, tone: "success" as const },
    { label: "مجموع الأمبيرات", value: `${stats.totalAmperes} أمبير`, icon: Zap, tone: "warning" as const },
    {
      label: "المحصّل هذا الشهر",
      value: formatMoney(stats.monthCollected),
      icon: TrendingUp,
      tone: "success" as const,
      hint: "مبلغ اشتراكات الأمبير الذي تم استلامه فعليًا هذا الشهر",
    },
    {
      label: "المتبقي الكلي",
      value: formatMoney(stats.totalOutstanding),
      icon: AlertTriangle,
      tone: "destructive" as const,
      hint: "ديون متأخرة من هذا الشهر وأشهر سابقة لم تُحصّل بعد",
    },
    {
      label: "المطلوب هذا الشهر",
      value: formatMoney(stats.monthDue),
      icon: Wallet,
      tone: "primary" as const,
      hint: "مجموع فواتير اشتراكات الأمبير للشهر الحالي",
    },
    { label: "المصروفات هذا الشهر", value: formatMoney(stats.monthExpensesTotal), icon: TrendingDown, tone: "destructive" as const },
    {
      label: "صافي الربح هذا الشهر",
      value: formatMoney(stats.netProfit),
      icon: TrendingUp,
      tone: stats.netProfit >= 0 ? ("success" as const) : ("destructive" as const),
      hint: "المحصّل بعد خصم المصاريف والوقود والصيانة",
    },
  ];

  const hasAlerts = stats.overdueCount > 0 || stats.expiredSubscriptionsCount > 0;

  const quickSummary = kpis.slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الرئيسية</h1>
        <p className="text-sm text-muted-foreground">نظرة عامة على {generator?.name ?? workspace.name}</p>
      </div>

      <Card className={openSession ? "border-success/30 bg-success/5" : undefined}>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-full",
                openSession ? "animate-pulse bg-success" : "bg-muted-foreground",
              )}
            />
            <div>
              <p className="text-sm font-semibold">{openSession ? "المولدة تعمل الآن" : "المولدة متوقفة"}</p>
              {openSession && (
                <p className="text-xs text-muted-foreground">تشغّل منذ الساعة {formatTime(openSession.startTime)}</p>
              )}
            </div>
          </div>
          {canManageGenerator && <OperatingSessionControl openSessionId={openSession?.id ?? null} />}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex flex-row-reverse items-center gap-4 p-4">
              <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl", TONES[kpi.tone])}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-bold tracking-tight sm:text-2xl">{kpi.value}</p>
                {"hint" in kpi && kpi.hint && <p className="mt-0.5 text-xs text-muted-foreground">{kpi.hint}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {hasAlerts && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          <div className="flex flex-col gap-1.5">
            <AlertTitle>تنبيهات</AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
              {stats.overdueCount > 0 && (
                <p>
                  يوجد <span className="font-semibold text-foreground">{stats.overdueCount}</span> مشترك متأخر عن الدفع —{" "}
                  <Link href="/customers" className="font-medium text-primary hover:underline">
                    عرض المشتركين
                  </Link>
                </p>
              )}
              {stats.expiredSubscriptionsCount > 0 && (
                <p>
                  يوجد <span className="font-semibold text-foreground">{stats.expiredSubscriptionsCount}</span> اشتراك منتهي يحتاج مراجعة —{" "}
                  <Link href="/subscriptions" className="font-medium text-primary hover:underline">
                    عرض الاشتراكات
                  </Link>
                </p>
              )}
            </AlertDescription>
          </div>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">الإيرادات والتحصيل — آخر 6 أشهر</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueTrendChart data={stats.revenueTrend} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">نمو المشتركين — آخر 6 أشهر</CardTitle>
          </CardHeader>
          <CardContent>
            <CustomerGrowthChart data={stats.growthTrend} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">ملخص سريع</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border p-0">
          {quickSummary.map((kpi) => (
            <div key={kpi.label} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="flex items-center gap-3">
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", TONES[kpi.tone])}>
                  <kpi.icon className="h-4 w-4" />
                </div>
                <p className="text-sm text-muted-foreground">{kpi.label}</p>
              </div>
              <p className="text-sm font-semibold">{kpi.value}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {stats.customerCount === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا يوجد مشتركون بعد</p>
            <Link href="/customers/new" className="text-sm text-primary hover:underline">
              إضافة أول مشترك
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
