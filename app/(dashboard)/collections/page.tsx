import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "@/components/customers/record-payment-dialog";
import { formatMoney } from "@/lib/utils/money";
import { Wallet, ChevronLeft } from "lucide-react";

export default async function CollectionsPage() {
  const { workspace, role } = await requireWorkspace();
  requirePermission(role, "payments.read");

  const openInvoices = await db.invoice.groupBy({
    by: ["customerId"],
    where: { workspaceId: workspace.id, status: { not: "PAID" } },
    _sum: { amount: true, paidAmount: true },
  });

  const outstandingList = openInvoices
    .map((row) => ({
      customerId: row.customerId,
      outstanding: Number(row._sum.amount ?? 0) - Number(row._sum.paidAmount ?? 0),
    }))
    .filter((row) => row.outstanding > 0)
    .sort((a, b) => b.outstanding - a.outstanding);

  const customers = await db.customer.findMany({
    where: { id: { in: outstandingList.map((o) => o.customerId) } },
  });
  const customerMap = new Map(customers.map((c) => [c.id, c]));

  const totalOutstanding = outstandingList.reduce((sum, o) => sum + o.outstanding, 0);
  const canRecordPayment = roleHasPermission(role, "payments.create");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الجباية</h1>
        <p className="text-sm text-muted-foreground">
          إجمالي المتبقي: <span className="font-semibold text-warning">{formatMoney(totalOutstanding)}</span>
        </p>
      </div>

      {outstandingList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Wallet className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد مستحقات غير محصّلة حاليًا</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {outstandingList.map((row) => {
            const customer = customerMap.get(row.customerId);
            if (!customer) return null;
            return (
              <Card key={row.customerId}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <Link href={`/customers/${customer.id}`} className="font-medium hover:underline">
                      {customer.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">#{customer.subscriberNumber} · {customer.phone}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-warning">{formatMoney(row.outstanding)}</span>
                    {canRecordPayment && <RecordPaymentDialog customerId={customer.id} outstanding={row.outstanding} />}
                    <Button asChild variant="ghost" size="icon">
                      <Link href={`/customers/${customer.id}`}>
                        <ChevronLeft className="h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
