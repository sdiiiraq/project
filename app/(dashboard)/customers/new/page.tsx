import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerCreateForm } from "./customer-create-form";

export default async function NewCustomerPage() {
  const { workspace, role } = await requireWorkspace();
  requirePermission(role, "customers.create");

  const amperePlans = await db.amperePlan.findMany({
    where: { workspaceId: workspace.id, isActive: true },
    orderBy: { amperes: "asc" },
  });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">إضافة مشترك جديد</h1>
        <p className="text-sm text-muted-foreground">سيتم إنشاء اشتراك فعّال وفاتورة الشهر الحالي تلقائيًا.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>بيانات المشترك</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerCreateForm
            amperePlans={amperePlans.map((p) => ({ id: p.id, amperes: p.amperes, monthlyPrice: Number(p.monthlyPrice) }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
