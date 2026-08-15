import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { getDashboardStats } from "@/lib/domain/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const kpis = [
    { label: "مجموع المشتركين", value: stats.customerCount, icon: Users },
    { label: "المشتركين الفعالين", value: stats.activeCustomerCount, icon: Users2 },
    { label: "مجموع الأمبيرات", value: `${stats.totalAmperes} أمبير`, icon: Zap },
    {
      label: "المطلوب هذا الشهر",
      value: formatMoney(stats.monthDue),
      icon: Wallet,
      hint: "مجموع فواتير الشهر الحالي لكل المشتركين",
    },
    {
      label: "المحصّل هذا الشهر",
      value: formatMoney(stats.monthCollected),
      icon: TrendingUp,
      hint: "المبلغ الذي تم استلامه فعليًا هذا الشهر",
    },
    {
      label: "المتبقي الكلي",
      value: formatMoney(stats.totalOutstanding),
      icon: AlertTriangle,
      hint: "ديون متأخرة من هذا الشهر وأشهر سابقة لم تُحصّل بعد",
    },
    { label: "المصروفات هذا الشهر", value: formatMoney(stats.monthExpensesTotal), icon: TrendingDown },
    { label: "صافي الربح هذا الشهر", value: formatMoney(stats.netProfit), icon: TrendingUp },
  ];

  const hasAlerts = stats.overdueCount > 0 || stats.expiredSubscriptionsCount > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">الرئيسية</h1>
        <p className="text-sm text-muted-foreground">{generator?.name ?? workspace.name}</p>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{kpi.value}</p>
              {"hint" in kpi && kpi.hint && <p className="mt-1 text-xs text-muted-foreground">{kpi.hint}</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {hasAlerts && (
        <Card className="border-warning/30 bg-warning/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-warning" /> تنبيهات
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {stats.overdueCount > 0 && (
              <p>
                يوجد <span className="font-semibold">{stats.overdueCount}</span> مشترك متأخر عن الدفع —{" "}
                <Link href="/collections" className="text-primary hover:underline">
                  عرض الجباية
                </Link>
              </p>
            )}
            {stats.expiredSubscriptionsCount > 0 && (
              <p>
                يوجد <span className="font-semibold">{stats.expiredSubscriptionsCount}</span> اشتراك منتهي يحتاج مراجعة —{" "}
                <Link href="/subscriptions" className="text-primary hover:underline">
                  عرض الاشتراكات
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
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
