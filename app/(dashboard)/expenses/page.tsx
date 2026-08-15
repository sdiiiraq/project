import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, roleHasPermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { CreateExpenseDialog } from "@/components/expenses/create-expense-dialog";
import { formatMoney } from "@/lib/utils/money";
import { Receipt } from "lucide-react";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ar-IQ", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export default async function ExpensesPage() {
  const { workspace, role } = await requireWorkspace();
  requirePermission(role, "expenses.read");

  const [expenses, categories] = await Promise.all([
    db.expense.findMany({
      where: { workspaceId: workspace.id },
      include: { category: true },
      orderBy: { date: "desc" },
      take: 50,
    }),
    // نستثني "وقود" من قائمة التصنيفات القابلة للاختيار — لها قسمها المستقل الآن. السجلات القديمة المرتبطة بها تبقى كما هي.
    db.expenseCategory.findMany({
      where: { OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }], name: { not: "وقود" } },
    }),
  ]);

  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const canCreate = roleHasPermission(role, "expenses.create");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">المصاريف</h1>
          <p className="text-sm text-muted-foreground">إجمالي آخر 50 سجل: {formatMoney(total)}</p>
        </div>
        {canCreate && <CreateExpenseDialog categories={categories.map((c) => ({ id: c.id, name: c.name }))} />}
      </div>

      {expenses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد مصاريف مسجّلة بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {expenses.map((expense) => (
            <Card key={expense.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-medium">{expense.category.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(expense.date)} {expense.vendor ? `· ${expense.vendor}` : ""}
                  </p>
                </div>
                <span className="font-semibold text-destructive">{formatMoney(Number(expense.amount))}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
