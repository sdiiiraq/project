"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import { createEquipmentSchema, createMaintenanceSchema } from "@/lib/validation/operations";

export type ActionResult = { error: string } | { success: true };

export async function createEquipment(input: unknown): Promise<ActionResult> {
  const parsed = createEquipmentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role } = await requireWorkspace();
  try {
    requirePermission(role, "maintenance.create");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const generator = await db.generator.findFirst({ where: { workspaceId: workspace.id } });
  if (!generator) return { error: "لم يتم العثور على بيانات المولدة." };

  await db.equipment.create({
    data: { workspaceId: workspace.id, generatorId: generator.id, ...parsed.data },
  });

  revalidatePath("/maintenance");
  return { success: true };
}

export async function createMaintenanceRecord(input: unknown): Promise<ActionResult> {
  const parsed = createMaintenanceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role } = await requireWorkspace();
  try {
    requirePermission(role, "maintenance.create");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const equipment = await db.equipment.findFirst({ where: { id: parsed.data.equipmentId, workspaceId: workspace.id } });
  if (!equipment) return { error: "المعدة غير موجودة." };

  await db.$transaction([
    db.maintenanceRecord.create({
      data: { workspaceId: workspace.id, ...parsed.data },
    }),
    db.ledgerEntry.create({
      data: {
        workspaceId: workspace.id,
        type: "MAINTENANCE",
        direction: "DEBIT",
        referenceId: equipment.id,
        amount: parsed.data.cost,
        description: `صيانة: ${parsed.data.type} — ${equipment.name}`,
      },
    }),
  ]);

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { success: true };
}
