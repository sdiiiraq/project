import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CustomerStatusBadge } from "@/components/customers/status-badge";
import { SearchInput } from "@/components/shared/search-input";
import { Pagination } from "@/components/shared/pagination";
import { formatMoney } from "@/lib/utils/money";
import { Plus, Users, ChevronLeft } from "lucide-react";
import type { Prisma } from "@prisma/client";

const PAGE_SIZE = 20;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const { workspace, role } = await requireWorkspace();
  requirePermission(role, "customers.read");

  const page = Math.max(1, Number(pageParam) || 1);

  const where: Prisma.CustomerWhereInput = {
    workspaceId: workspace.id,
    deletedAt: null,
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

  const [customers, total] = await Promise.all([
    db.customer.findMany({
      where,
      include: { subscriptions: { where: { status: "ACTIVE" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.customer.count({ where }),
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

  const canCreate = roleHasPermission(role, "customers.create");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">المشتركين</h1>
          <p className="text-sm text-muted-foreground">{total} مشترك</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/customers/new">
              <Plus className="h-4 w-4" /> إضافة مشترك
            </Link>
          </Button>
        )}
      </div>

      <SearchInput placeholder="ابحث بالاسم أو الهاتف أو رقم المشترك..." />

      {customers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">{q ? "لا توجد نتائج مطابقة" : "لا يوجد مشتركون بعد"}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop: جدول كامل */}
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">المشترك</th>
                  <th className="px-4 py-3 text-start font-medium">الأمبير</th>
                  <th className="px-4 py-3 text-start font-medium">المنطقة</th>
                  <th className="px-4 py-3 text-start font-medium">المتبقي</th>
                  <th className="px-4 py-3 text-start font-medium">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">#{customer.subscriberNumber} · {customer.phone}</p>
                    </td>
                    <td className="px-4 py-3">{customer.subscriptions[0]?.amperes ?? "—"} أمبير</td>
                    <td className="px-4 py-3">{customer.region ?? "—"}</td>
                    <td className="px-4 py-3">
                      {formatMoney(outstandingMap.get(customer.id) ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      <CustomerStatusBadge status={customer.status} />
                    </td>
                    <td className="px-4 py-3 text-end">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/customers/${customer.id}`}>
                          فتح الملف <ChevronLeft className="h-4 w-4" />
                        </Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Mobile/Tablet: بطاقات */}
          <div className="flex flex-col gap-3 lg:hidden">
            {customers.map((customer) => (
              <Link key={customer.id} href={`/customers/${customer.id}`}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{customer.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {customer.subscriptions[0]?.amperes ?? "—"} أمبير · #{customer.subscriberNumber}
                      </p>
                      <p className="mt-1 text-sm">المتبقي: {formatMoney(outstandingMap.get(customer.id) ?? 0)}</p>
                    </div>
                    <CustomerStatusBadge status={customer.status} />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/customers" searchParams={{ q }} />
        </>
      )}
    </div>
  );
}
