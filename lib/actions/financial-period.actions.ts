"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";

export type ActionResult = { error: string } | { success: true };

// بعد إغلاق الشهر، أي تصحيح للعمليات القديمة يجب أن يمر عبر Adjustment وليس تعديلًا مباشرًا.
export async function closeFinancialPeriod(year: number, month: number): Promise<ActionResult> {
  const { workspace, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "billing.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  await db.financialPeriod.upsert({
    where: { workspaceId_year_month: { workspaceId: workspace.id, year, month } },
    update: { status: "CLOSED", closedByUserId: user.id, closedAt: new Date() },
    create: {
      workspaceId: workspace.id,
      year,
      month,
      status: "CLOSED",
      closedByUserId: user.id,
      closedAt: new Date(),
    },
  });

  revalidatePath("/reports");
  return { success: true };
}

export async function isPeriodClosed(workspaceId: string, date: Date): Promise<boolean> {
  const period = await db.financialPeriod.findUnique({
    where: {
      workspaceId_year_month: {
        workspaceId,
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
      },
    },
  });
  return period?.status === "CLOSED";
}
