"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import { createFuelPurchaseSchema, createFuelUsageSchema } from "@/lib/validation/operations";

export type ActionResult = { error: string } | { success: true };

export async function createFuelPurchase(input: unknown): Promise<ActionResult> {
  const parsed = createFuelPurchaseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role, user } = await requireWorkspace();
  try {
    requirePermission(role, "fuel.create");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const totalCost = parsed.data.quantityLiters * parsed.data.pricePerLiter;

  await db.$transaction([
    db.fuelPurchase.create({
      data: {
        workspaceId: workspace.id,
        quantityLiters: parsed.data.quantityLiters,
        pricePerLiter: parsed.data.pricePerLiter,
        totalCost,
        supplier: parsed.data.supplier,
        date: parsed.data.date,
        createdByUserId: user.id,
      },
    }),
    db.ledgerEntry.create({
      data: {
        workspaceId: workspace.id,
        type: "FUEL",
        direction: "DEBIT",
        referenceId: "fuel-purchase",
        amount: totalCost,
        description: `شراء وقود: ${parsed.data.quantityLiters} لتر`,
      },
    }),
  ]);

  revalidatePath("/fuel");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function createFuelUsage(input: unknown): Promise<ActionResult> {
  const parsed = createFuelUsageSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role } = await requireWorkspace();
  try {
    requirePermission(role, "fuel.create");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  await db.fuelUsage.create({
    data: {
      workspaceId: workspace.id,
      quantityLiters: parsed.data.quantityLiters,
      date: parsed.data.date,
      note: parsed.data.note,
    },
  });

  revalidatePath("/fuel");
  return { success: true };
}
