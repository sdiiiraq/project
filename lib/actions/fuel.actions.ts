"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import {
  createFuelPurchaseSchema,
  updateFuelPurchaseSchema,
  deleteFuelPurchaseSchema,
  createFuelUsageSchema,
  updateFuelUsageSchema,
  deleteFuelUsageSchema,
  updateFuelConsumptionRateSchema,
} from "@/lib/validation/operations";

export type ActionResult = { error: string } | { success: true };

export async function createFuelPurchase(input: unknown): Promise<ActionResult> {
  const parsed = createFuelPurchaseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "fuel.create");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const totalCost = Math.round(parsed.data.quantityLiters * parsed.data.pricePerLiter);

  await db.$transaction(async (tx) => {
    const purchase = await tx.fuelPurchase.create({
      data: {
        workspaceId: workspace.id,
        quantityLiters: parsed.data.quantityLiters,
        pricePerLiter: parsed.data.pricePerLiter,
        totalCost,
        supplier: parsed.data.supplier,
        date: parsed.data.date,
        createdByUserId: user.id,
      },
    });

    await tx.ledgerEntry.create({
      data: {
        workspaceId: workspace.id,
        type: "FUEL",
        direction: "DEBIT",
        referenceId: purchase.id,
        amount: totalCost,
        description: `شراء وقود: ${parsed.data.quantityLiters} لتر`,
      },
    });
  });

  revalidatePath("/fuel");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateFuelPurchase(input: unknown): Promise<ActionResult> {
  const parsed = updateFuelPurchaseSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "fuel.update");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const existing = await db.fuelPurchase.findFirst({ where: { id: parsed.data.id, workspaceId: workspace.id } });
  if (!existing) return { error: "سجل الشراء غير موجود." };

  const totalCost = Math.round(parsed.data.quantityLiters * parsed.data.pricePerLiter);

  await db.$transaction(async (tx) => {
    await tx.fuelPurchase.update({
      where: { id: parsed.data.id },
      data: {
        quantityLiters: parsed.data.quantityLiters,
        pricePerLiter: parsed.data.pricePerLiter,
        totalCost,
        supplier: parsed.data.supplier,
        date: parsed.data.date,
      },
    });

    await tx.ledgerEntry.updateMany({
      where: { workspaceId: workspace.id, type: "FUEL", referenceId: parsed.data.id },
      data: { amount: totalCost, description: `شراء وقود: ${parsed.data.quantityLiters} لتر` },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "fuel.purchase_update",
        entity: "FuelPurchase",
        entityId: parsed.data.id,
        before: { quantityLiters: Number(existing.quantityLiters), pricePerLiter: Number(existing.pricePerLiter), totalCost: Number(existing.totalCost) },
        after: { quantityLiters: parsed.data.quantityLiters, pricePerLiter: parsed.data.pricePerLiter, totalCost },
      },
    });
  });

  revalidatePath("/fuel");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteFuelPurchase(input: unknown): Promise<ActionResult> {
  const parsed = deleteFuelPurchaseSchema.safeParse(input);
  if (!parsed.success) return { error: "بيانات غير صحيحة" };

  const { workspace, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "fuel.delete");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const existing = await db.fuelPurchase.findFirst({ where: { id: parsed.data.id, workspaceId: workspace.id } });
  if (!existing) return { error: "سجل الشراء غير موجود." };

  await db.$transaction(async (tx) => {
    await tx.ledgerEntry.deleteMany({ where: { workspaceId: workspace.id, type: "FUEL", referenceId: parsed.data.id } });
    await tx.fuelPurchase.delete({ where: { id: parsed.data.id } });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "fuel.purchase_delete",
        entity: "FuelPurchase",
        entityId: parsed.data.id,
        before: { quantityLiters: Number(existing.quantityLiters), pricePerLiter: Number(existing.pricePerLiter), totalCost: Number(existing.totalCost) },
      },
    });
  });

  revalidatePath("/fuel");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function createFuelUsage(input: unknown): Promise<ActionResult> {
  const parsed = createFuelUsageSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, permissions } = await requireWorkspace();
  try {
    requirePermission(permissions, "fuel.create");
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

export async function updateFuelUsage(input: unknown): Promise<ActionResult> {
  const parsed = updateFuelUsageSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "fuel.update");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const existing = await db.fuelUsage.findFirst({ where: { id: parsed.data.id, workspaceId: workspace.id } });
  if (!existing) return { error: "سجل الاستهلاك غير موجود." };

  await db.$transaction(async (tx) => {
    await tx.fuelUsage.update({
      where: { id: parsed.data.id },
      data: { quantityLiters: parsed.data.quantityLiters, date: parsed.data.date, note: parsed.data.note },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "fuel.usage_update",
        entity: "FuelUsage",
        entityId: parsed.data.id,
        before: { quantityLiters: Number(existing.quantityLiters) },
        after: { quantityLiters: parsed.data.quantityLiters },
      },
    });
  });

  revalidatePath("/fuel");
  return { success: true };
}

export async function deleteFuelUsage(input: unknown): Promise<ActionResult> {
  const parsed = deleteFuelUsageSchema.safeParse(input);
  if (!parsed.success) return { error: "بيانات غير صحيحة" };

  const { workspace, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "fuel.delete");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const existing = await db.fuelUsage.findFirst({ where: { id: parsed.data.id, workspaceId: workspace.id } });
  if (!existing) return { error: "سجل الاستهلاك غير موجود." };

  await db.$transaction(async (tx) => {
    await tx.fuelUsage.delete({ where: { id: parsed.data.id } });
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "fuel.usage_delete",
        entity: "FuelUsage",
        entityId: parsed.data.id,
        before: { quantityLiters: Number(existing.quantityLiters) },
      },
    });
  });

  revalidatePath("/fuel");
  return { success: true };
}

export async function updateFuelConsumptionRate(input: unknown): Promise<ActionResult> {
  const parsed = updateFuelConsumptionRateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "settings.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const generator = await db.generator.findFirst({ where: { workspaceId: workspace.id } });
  if (!generator) return { error: "لم يتم العثور على بيانات المولدة." };

  await db.$transaction(async (tx) => {
    await tx.generator.update({
      where: { id: generator.id },
      data: { fuelConsumptionPerHour: parsed.data.fuelConsumptionPerHour },
    });

    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "generator.fuel_rate_update",
        entity: "Generator",
        entityId: generator.id,
        before: { fuelConsumptionPerHour: generator.fuelConsumptionPerHour ? Number(generator.fuelConsumptionPerHour) : null },
        after: { fuelConsumptionPerHour: parsed.data.fuelConsumptionPerHour },
      },
    });
  });

  revalidatePath("/fuel");
  revalidatePath("/settings");
  return { success: true };
}
