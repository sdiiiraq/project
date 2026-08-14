import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac/access";
import { canUseFeature } from "@/lib/rbac/features";
import { getAnalyticsData, getAdvancedAnalyticsData } from "@/lib/domain/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExpenseBreakdownChart } from "@/components/analytics/expense-breakdown-chart";
import { PercentageBarChart } from "@/components/analytics/percentage-bar-chart";
import { MoneyBarChart } from "@/components/analytics/money-bar-chart";
import { CountBarChart } from "@/components/analytics/count-bar-chart";
import { Lock } from "lucide-react";

export default async function AnalyticsPage() {
  const { workspace, role } = await requireWorkspace();
  requirePermission(role, "reports.read");

  const [{ expenseBreakdown, collectionRateTrend, fuelCostTrend }, hasAdvanced] = await Promise.all([
    getAnalyticsData(workspace.id),
    canUseFeature(workspace.id, "FEATURE_ADVANCED_ANALYTICS"),
  ]);

  const advanced = hasAdvanced ? await getAdvancedAnalyticsData(workspace.id) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">التحليلات</h1>
        <p className="text-sm text-muted-foreground">آخر 6 أشهر</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">توزيع المصاريف حسب التصنيف</CardTitle>
          </CardHeader>
          <CardContent>
            <ExpenseBreakdownChart data={expenseBreakdown} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">نسبة التحصيل الشهرية</CardTitle>
          </CardHeader>
          <CardContent>
            <PercentageBarChart data={collectionRateTrend} dataKey="نسبة التحصيل" />
          </CardContent>
        </Card>

        <Card className={advanced ? "" : "lg:col-span-2"}>
          <CardHeader>
            <CardTitle className="text-sm">كلفة الوقود الشهرية</CardTitle>
          </CardHeader>
          <CardContent>
            <MoneyBarChart data={fuelCostTrend} dataKey="كلفة الوقود" />
          </CardContent>
        </Card>

        {advanced ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">هامش الربح الشهري (%)</CardTitle>
              </CardHeader>
              <CardContent>
                <PercentageBarChart data={advanced.profitMarginTrend} dataKey="هامش الربح" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">المشتركون المقطوعون شهريًا</CardTitle>
              </CardHeader>
              <CardContent>
                <CountBarChart data={advanced.retentionTrend} dataKey="مشتركون مقطوعون" />
              </CardContent>
            </Card>
          </>
        ) : (
          <Card className="flex flex-col items-center justify-center gap-3 py-10 text-center lg:col-span-2">
            <Lock className="h-8 w-8 text-muted-foreground" />
            <p className="font-medium">التحليلات المتقدمة (هامش الربح واستبقاء المشتركين) غير متاحة في باقتك الحالية.</p>
            <p className="text-sm text-primary">تواصل مع الدعم لترقية الباقة</p>
          </Card>
        )}
      </div>
    </div>
  );
}
