import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AssignCollectorDialog } from "@/components/collectors/assign-collector-dialog";
import { SettleCollectorDialog } from "@/components/collectors/settle-collector-dialog";
import { formatMoney } from "@/lib/utils/money";
import { UserCog } from "lucide-react";

export default async function CollectorsPage() {
  const { workspace, role } = await requireWorkspace();
  requirePermission(role, "collectors.manage");

  const [collectorMembers, customers] = await Promise.all([
    db.workspaceMember.findMany({ where: { workspaceId: workspace.id, role: "COLLECTOR" }, include: { user: true } }),
    db.customer.findMany({ where: { workspaceId: workspace.id, deletedAt: null }, select: { id: true, name: true } }),
  ]);

  const collectors = await Promise.all(
    collectorMembers.map(async (member) => {
      const assignments = await db.collectorAssignment.findMany({
        where: { workspaceId: workspace.id, collectorUserId: member.userId, unassignedAt: null },
        include: { customer: true },
      });
      const assignedCustomerIds = assignments.map((a) => a.customerId);
      const outstanding = await db.invoice.aggregate({
        where: { customerId: { in: assignedCustomerIds }, status: { not: "PAID" } },
        _sum: { amount: true, paidAmount: true },
      });
      const expected = Number(outstanding._sum.amount ?? 0) - Number(outstanding._sum.paidAmount ?? 0);

      const settlements = await db.collectorSettlement.findMany({
        where: { workspaceId: workspace.id, collectorUserId: member.userId },
        orderBy: { createdAt: "desc" },
        take: 3,
      });

      return { member, assignments, expected, settlements };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الجباة</h1>
          <p className="text-sm text-muted-foreground">{collectors.length} جابي</p>
        </div>
        <AssignCollectorDialog
          collectors={collectorMembers.map((m) => ({ userId: m.userId, name: m.user.fullName }))}
          customers={customers}
        />
      </div>

      {collectors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <UserCog className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا يوجد جباة بعد</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              أضف عضوًا بدور «جابي» من صفحة الإعدادات، ثم عيّن له المشتركين من هنا.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {collectors.map(({ member, assignments, expected, settlements }) => (
            <Card key={member.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{member.user.fullName}</CardTitle>
                  <p className="text-xs text-muted-foreground">{assignments.length} مشترك مُعيّن</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-warning">{formatMoney(expected)}</span>
                  <SettleCollectorDialog collectorUserId={member.userId} expectedAmount={expected} />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {settlements.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {settlements.map((s) => (
                      <Badge key={s.id} variant={s.status === "COMPLETED" ? "success" : s.status === "DISPUTED" ? "destructive" : "secondary"}>
                        {formatMoney(Number(s.actualAmount))} — {s.status}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
