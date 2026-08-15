import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CustomerStatusBadge } from "@/components/customers/status-badge";
import { RecordPaymentDialog } from "@/components/customers/record-payment-dialog";
import { ChangeAmpereDialog } from "@/components/customers/change-ampere-dialog";
import { EditCustomerDialog } from "@/components/customers/edit-customer-dialog";
import { DeleteCustomerDialog } from "@/components/customers/delete-customer-dialog";
import { formatMoney } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import { MapPin, Phone, Zap, Tag } from "lucide-react";

const CUSTOMER_TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: "سكني",
  COMMERCIAL: "تجاري",
  NORMAL: "عادي",
};

const TIER_LABELS: Record<string, string> = {
  NORMAL: "عادي",
  GOLD: "ذهبي",
};

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace, role, permissions } = await requireWorkspace();
  requirePermission(permissions, "customers.read");

  const customer = await db.customer.findFirst({
    where: { id, workspaceId: workspace.id },
    include: {
      subscriptions: { where: { status: "ACTIVE" }, take: 1 },
      invoices: { orderBy: { periodStart: "desc" } },
      payments: { orderBy: { date: "desc" } },
      ampereHistory: { orderBy: { effectiveDate: "desc" } },
    },
  });

  if (!customer) notFound();

  const ws = await db.workspace.findUnique({
    where: { id: workspace.id },
    select: { normalAmperePriceIQD: true, goldAmperePriceIQD: true },
  });
  const normalPrice = Number(ws?.normalAmperePriceIQD ?? 0);
  const goldPrice = Number(ws?.goldAmperePriceIQD ?? 0);

  const activeSubscription = customer.subscriptions[0];
  const totalDue = customer.invoices.reduce((sum, inv) => sum + Number(inv.amount), 0);
  const totalPaid = customer.invoices.reduce((sum, inv) => sum + Number(inv.paidAmount), 0);
  const outstanding = totalDue - totalPaid;
  const lastPayment = customer.payments[0];

  const canRecordPayment = roleHasPermission(permissions, "payments.create");
  const canManageSubscription = roleHasPermission(permissions, "subscriptions.manage");
  const canUpdateCustomer = roleHasPermission(permissions, "customers.update");
  const canDeleteCustomer = roleHasPermission(permissions, "customers.delete");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{customer.name}</h1>
            <CustomerStatusBadge status={customer.status} />
          </div>
          <p className="text-sm text-muted-foreground">#{customer.subscriberNumber}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageSubscription && (
            <ChangeAmpereDialog
              customerId={customer.id}
              currentAmperes={activeSubscription?.amperes ?? 0}
              currentTier={activeSubscription?.tier ?? "NORMAL"}
              normalPrice={normalPrice}
              goldPrice={goldPrice}
            />
          )}
          {canRecordPayment && (
            <RecordPaymentDialog
              customerId={customer.id}
              customerName={customer.name}
              outstanding={outstanding}
              subscriptionAmperes={activeSubscription?.amperes ?? 0}
              subscriptionPrice={
                activeSubscription ? Math.round(Number(activeSubscription.price) / activeSubscription.amperes) : 0
              }
            />
          )}
          {canUpdateCustomer && (
            <EditCustomerDialog
              customer={{
                id: customer.id,
                name: customer.name,
                phone: customer.phone ?? undefined,
                region: customer.region ?? undefined,
                neighborhood: customer.neighborhood ?? undefined,
                alley: customer.alley ?? undefined,
                houseNumber: customer.houseNumber ?? undefined,
                notes: customer.notes ?? undefined,
                customerType: customer.customerType,
              }}
            />
          )}
          {canDeleteCustomer && <DeleteCustomerDialog customerId={customer.id} customerName={customer.name} />}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">المطلوب</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatMoney(totalDue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">الدافع</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-success">{formatMoney(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">المتبقي</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-warning">{formatMoney(outstanding)}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">المعلومات</TabsTrigger>
          <TabsTrigger value="financial">السجل المالي</TabsTrigger>
          <TabsTrigger value="history">التاريخ</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" /> {customer.phone ?? "—"}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                {[customer.region, customer.neighborhood, customer.alley, customer.houseNumber].filter(Boolean).join(" - ") || "—"}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Zap className="h-4 w-4 text-muted-foreground" />
                {activeSubscription
                  ? `${activeSubscription.amperes} أمبير (${TIER_LABELS[activeSubscription.tier]}) — ${formatMoney(Number(activeSubscription.price))} شهريًا`
                  : "لا يوجد اشتراك فعّال"}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Tag className="h-4 w-4 text-muted-foreground" />
                نوع المشترك: {CUSTOMER_TYPE_LABELS[customer.customerType]}
              </div>
              {customer.notes && <p className="text-sm text-muted-foreground sm:col-span-2">{customer.notes}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial">
          {customer.invoices.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">لا توجد فواتير بعد</CardContent>
            </Card>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الفترة</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>المدفوع</TableHead>
                  <TableHead>الحالة</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>{formatDate(invoice.periodStart)}</TableCell>
                    <TableCell>{formatMoney(Number(invoice.amount))}</TableCell>
                    <TableCell>{formatMoney(Number(invoice.paidAmount))}</TableCell>
                    <TableCell>{invoice.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {lastPayment && (
            <p className="mt-3 text-sm text-muted-foreground">
              آخر دفعة: {formatMoney(Number(lastPayment.amount))} بتاريخ {formatDate(lastPayment.date)}
            </p>
          )}
        </TabsContent>

        <TabsContent value="history">
          <div className="flex flex-col gap-3">
            {customer.payments.length === 0 && customer.ampereHistory.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">لا يوجد سجل بعد</p>
            ) : (
              <>
                {customer.payments.map((payment) => (
                  <Card key={payment.id}>
                    <CardContent className="flex items-center justify-between p-4 text-sm">
                      <span>دفعة {formatMoney(Number(payment.amount))}</span>
                      <span className="text-muted-foreground">{formatDate(payment.date)}</span>
                    </CardContent>
                  </Card>
                ))}
                {customer.ampereHistory.map((change) => (
                  <Card key={change.id}>
                    <CardContent className="flex items-center justify-between p-4 text-sm">
                      <span>
                        تغيير الأمبير: {change.oldAmperes ?? "—"} ← {change.newAmperes}
                      </span>
                      <span className="text-muted-foreground">{formatDate(change.effectiveDate)}</span>
                    </CardContent>
                  </Card>
                ))}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
