"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import { createExpenseSchema } from "@/lib/validation/operations";

export type ActionResult = { error: string } | { success: true };

export async function createExpense(input: unknown): Promise<ActionResult> {
  const parsed = createExpenseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "expenses.create");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const category = await db.expenseCategory.findFirst({
    where: { id: parsed.data.categoryId, OR: [{ workspaceId: workspace.id }, { workspaceId: null, isSystem: true }] },
  });
  if (!category) return { error: "تصنيف المصروف غير موجود." };

  await db.$transaction([
    db.expense.create({
      data: {
        workspaceId: workspace.id,
        categoryId: category.id,
        amount: parsed.data.amount,
        date: parsed.data.date,
        vendor: parsed.data.vendor,
        note: parsed.data.note,
        createdByUserId: user.id,
      },
    }),
    db.ledgerEntry.create({
      data: {
        workspaceId: workspace.id,
        type: "EXPENSE",
        direction: "DEBIT",
        referenceId: category.id,
        amount: parsed.data.amount,
        description: `مصروف: ${category.name}`,
      },
    }),
  ]);

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { success: true };
}
