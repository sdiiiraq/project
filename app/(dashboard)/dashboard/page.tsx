import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getDashboardStats } from "@/lib/domain/dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RevenueTrendChart } from "@/components/dashboard/trend-chart";
import { CustomerGrowthChart } from "@/components/dashboard/customer-growth-chart";
import { formatMoney } from "@/lib/utils/money";
import { Users, Zap, Wallet, TrendingUp, TrendingDown, AlertTriangle, Users2 } from "lucide-react";

export default async function DashboardPage() {
  const { workspace } = await requireWorkspace();
  const [generator, stats] = await Promise.all([
    db.generator.findFirst({ where: { workspaceId: workspace.id } }),
    getDashboardStats(workspace.id),
  ]);

  const kpis = [
    { label: "إجمالي المشتركين", value: stats.customerCount, icon: Users },
    { label: "المشتركين الفعالين", value: stats.activeCustomerCount, icon: Users2 },
    { label: "إجمالي الأمبيرات", value: `${stats.totalAmperes} أمبير`, icon: Zap },
    { label: "المطلوب هذا الشهر", value: formatMoney(stats.monthDue), icon: Wallet },
    { label: "المحصّل هذا الشهر", value: formatMoney(stats.monthCollected), icon: TrendingUp },
    { label: "المتبقي الكلي", value: formatMoney(stats.totalOutstanding), icon: AlertTriangle },
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold">{kpi.value}</p>
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
