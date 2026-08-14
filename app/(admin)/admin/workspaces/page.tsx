import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SearchInput } from "@/components/shared/search-input";
import { Building2, ChevronLeft } from "lucide-react";
import type { Prisma } from "@prisma/client";

const STATUS_VARIANT = { ACTIVE: "success", SUSPENDED: "warning", DISABLED: "destructive" } as const;

export default async function AdminWorkspacesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;

  const where: Prisma.WorkspaceWhereInput = q ? { name: { contains: q, mode: "insensitive" } } : {};

  const workspaces = await db.workspace.findMany({
    where,
    include: { platformSubscription: { include: { plan: true } }, _count: { select: { customers: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">المولدات (Workspaces)</h1>
        <p className="text-sm text-muted-foreground">{workspaces.length} مولدة</p>
      </div>

      <SearchInput placeholder="ابحث باسم المولدة..." />

      {workspaces.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد نتائج</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {workspaces.map((ws) => (
            <Link key={ws.id} href={`/admin/workspaces/${ws.id}`}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{ws.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ws._count.customers} مشترك · {ws.platformSubscription?.plan.name ?? "بدون باقة"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={STATUS_VARIANT[ws.status]}>{ws.status}</Badge>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
