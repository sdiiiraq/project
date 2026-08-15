import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CustomerCreateForm } from "./customer-create-form";

export default async function NewCustomerPage() {
  const { workspace, role } = await requireWorkspace();
  requirePermission(role, "customers.create");

  const ws = await db.workspace.findUnique({ where: { id: workspace.id }, select: { amperePriceIQD: true } });
  const pricePerAmpere = Number(ws?.amperePriceIQD ?? 0);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">إضافة مشترك جديد</h1>
        <p className="text-sm text-muted-foreground">سيتم إنشاء اشتراك فعّال وفاتورة الشهر الحالي تلقائيًا.</p>
      </div>

      {pricePerAmpere <= 0 && (
        <Alert variant="warning">
          <AlertDescription>
            لم يتم تحديد سعر الأمبير الواحد بعد. اذهب إلى{" "}
            <a href="/settings" className="font-medium text-primary hover:underline">
              الإعدادات
            </a>{" "}
            وحدده أولًا قبل إضافة مشترك.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>بيانات المشترك</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerCreateForm pricePerAmpere={pricePerAmpere} />
        </CardContent>
      </Card>
    </div>
  );
}
