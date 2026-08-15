import { getAdminDashboardStats } from "@/lib/domain/admin-dashboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CountBarChart } from "@/components/analytics/count-bar-chart";
import { formatMoney } from "@/lib/utils/money";
import { Building2, CheckCircle2, PauseCircle, Clock, TrendingUp, Wallet } from "lucide-react";

export default async function AdminDashboardPage() {
  const stats = await getAdminDashboardStats();

  const kpis = [
    { label: "إجمالي المولدات (Workspaces)", value: stats.totalWorkspaces, icon: Building2 },
    { label: "المولدات الفعالة", value: stats.activeWorkspaces, icon: CheckCircle2 },
    { label: "الموقوفة", value: stats.suspendedWorkspaces, icon: PauseCircle },
    { label: "تجريبية", value: stats.trialSubscriptions, icon: Clock },
    { label: "اشتراكات فعالة", value: stats.activeSubscriptions, icon: CheckCircle2 },
    { label: "اشتراكات منتهية", value: stats.expiredSubscriptions, icon: Clock },
    { label: "MRR", value: formatMoney(stats.mrr), icon: TrendingUp },
    { label: "ARR", value: formatMoney(stats.arr), icon: Wallet },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">لوحة تحكم المنصة</h1>
        <p className="text-sm text-muted-foreground">نظرة عامة على جميع مشتركي أمبير</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{kpi.label}</CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tracking-tight md:text-3xl">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">نمو المولدات المسجّلة — آخر 6 أشهر</CardTitle>
        </CardHeader>
        <CardContent>
          <CountBarChart data={stats.workspaceGrowth} dataKey="عدد المولدات" />
        </CardContent>
      </Card>
    </div>
  );
}
