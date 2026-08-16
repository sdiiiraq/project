import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { monthRange } from "@/lib/domain/billing";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { CustomerStatusBadge } from "@/components/customers/status-badge";
import { ContactActions } from "@/components/customers/contact-actions";
import { PaymentStatusTabs } from "@/components/customers/payment-status-tabs";
import { SearchInput } from "@/components/shared/search-input";
import { SortSelect } from "@/components/shared/sort-select";
import { Pagination } from "@/components/shared/pagination";
import { PageHelp } from "@/components/help/page-help";
import { formatMoney } from "@/lib/utils/money";
import { Plus, Users, ChevronLeft } from "lucide-react";
import type { Prisma, InvoiceStatus } from "@prisma/client";

const PAGE_SIZE = 20;

type PaymentBucket = "paid" | "partial" | "unpaid";

function bucketFor(status: InvoiceStatus | undefined): PaymentBucket {
  if (status === "PAID") return "paid";
  if (status === "PARTIALLY_PAID") return "partial";
  return "unpaid"; // UNPAID, OVERDUE، أو لا توجد فاتورة لهذا الشهر بعد
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; sort?: string; status?: string }>;
}) {
  const { q, page: pageParam, sort, status } = await searchParams;
  const { workspace, permissions } = await requireWorkspace();
  requirePermission(permissions, "customers.read");

  const page = Math.max(1, Number(pageParam) || 1);

  // حالة الدفع تُحسب من فاتورة الشهر الحالي لكل مشترك — تحديد تلقائي، ليس State محلي.
  const now = new Date();
  const { periodStart: monthStart, periodEnd: monthEnd } = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);

  const [allCustomerIds, monthInvoices] = await Promise.all([
    db.customer.findMany({ where: { workspaceId: workspace.id, deletedAt: null }, select: { id: true } }),
    db.invoice.findMany({
      where: { workspaceId: workspace.id, periodStart: { gte: monthStart, lte: monthEnd } },
      select: { customerId: true, status: true },
    }),
  ]);

  const statusMap = new Map(monthInvoices.map((i) => [i.customerId, i.status]));
  const counts: Record<"all" | PaymentBucket, number> = { all: allCustomerIds.length, paid: 0, partial: 0, unpaid: 0 };
  for (const c of allCustomerIds) counts[bucketFor(statusMap.get(c.id))]++;

  const statusFilteredIds =
    status === "paid" || status === "partial" || status === "unpaid"
      ? allCustomerIds.filter((c) => bucketFor(statusMap.get(c.id)) === status).map((c) => c.id)
      : undefined;

  const where: Prisma.CustomerWhereInput = {
    workspaceId: workspace.id,
    deletedAt: null,
    ...(statusFilteredIds ? { id: { in: statusFilteredIds } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { subscriberNumber: { contains: q } },
            { houseNumber: { contains: q } },
          ],
        }
      : {}),
  };

  const sortByAmperes = sort === "amperes";

  const [total, customers] = await Promise.all([
    sortByAmperes ? db.customerSubscription.count({ where: { status: "ACTIVE", customer: where } }) : db.customer.count({ where }),
    sortByAmperes
      ? db.customerSubscription
          .findMany({
            where: { status: "ACTIVE", customer: where },
            orderBy: { amperes: "asc" },
            skip: (page - 1) * PAGE_SIZE,
            take: PAGE_SIZE,
            include: { customer: true },
          })
          .then((subs) => subs.map((s) => ({ ...s.customer, subscriptions: [{ amperes: s.amperes }] })))
      : db.customer.findMany({
          where,
          include: { subscriptions: { where: { status: "ACTIVE" }, take: 1 } },
          orderBy: sort === "name" ? { name: "asc" } : { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
  ]);

  const customerIds = customers.map((c) => c.id);
  const outstandingByCustomer = await db.invoice.groupBy({
    by: ["customerId"],
    where: { customerId: { in: customerIds }, status: { not: "PAID" } },
    _sum: { amount: true, paidAmount: true },
  });
  const outstandingMap = new Map(
    outstandingByCustomer.map((o) => [o.customerId, Number(o._sum.amount ?? 0) - Number(o._sum.paidAmount ?? 0)]),
  );

  const canCreate = roleHasPermission(permissions, "customers.create");
  const extraParams = { q, sort, status };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">المشتركين</h1>
          <p className="text-sm text-muted-foreground">{total} مشترك</p>
        </div>
        <div className="flex items-center gap-2">
          <PageHelp pageKey="customers" />
          {canCreate && (
            <Button asChild>
              <Link href="/customers/new">
                <Plus className="h-4 w-4" /> إضافة مشترك
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput placeholder="ابحث بالاسم أو الهاتف أو رقم المشترك..." />
        </div>
        <SortSelect
          options={[
            { value: "recent", label: "الأحدث أولًا" },
            { value: "name", label: "الاسم أبجديًا" },
            { value: "amperes", label: "الأمبير: الأقل أولًا" },
          ]}
        />
      </div>

      <PaymentStatusTabs active={status} counts={counts} basePath="/customers" searchParams={extraParams} />

      {customers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">{q || status ? "لا توجد نتائج مطابقة" : "لا يوجد مشتركون بعد"}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop: جدول كامل */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>المشترك</TableHead>
                  <TableHead>الأمبير</TableHead>
                  <TableHead>المنطقة</TableHead>
                  <TableHead>المتبقي</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell>
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">#{customer.subscriberNumber} · {customer.phone}</p>
                    </TableCell>
                    <TableCell>{customer.subscriptions[0]?.amperes ?? "—"} أمبير</TableCell>
                    <TableCell>{customer.region ?? "—"}</TableCell>
                    <TableCell>{formatMoney(outstandingMap.get(customer.id) ?? 0)}</TableCell>
                    <TableCell>
                      <CustomerStatusBadge status={customer.status} />
                    </TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        <ContactActions phone={customer.phone} />
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/customers/${customer.id}`}>
                            فتح الملف <ChevronLeft className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile/Tablet: بطاقات */}
          <div className="flex flex-col gap-3 lg:hidden">
            {customers.map((customer) => (
              <Card key={customer.id}>
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <Link href={`/customers/${customer.id}`} className="min-w-0 flex-1">
                    <p className="truncate font-medium">{customer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {customer.subscriptions[0]?.amperes ?? "—"} أمبير · #{customer.subscriberNumber}
                    </p>
                    <p className="mt-1 text-sm">المتبقي: {formatMoney(outstandingMap.get(customer.id) ?? 0)}</p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <ContactActions phone={customer.phone} />
                    <CustomerStatusBadge status={customer.status} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/customers" searchParams={extraParams} />
        </>
      )}
    </div>
  );
}
