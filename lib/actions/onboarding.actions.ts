"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import {
  pricePerAmpereSchema,
  generatorInfoSchema,
  generatorNameSchema,
} from "@/lib/validation/onboarding";

export type ActionResult = { error: string } | { success: true };

export async function updateGeneratorName(input: unknown): Promise<ActionResult> {
  const parsed = generatorNameSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, permissions } = await requireWorkspace();
  try {
    requirePermission(permissions, "settings.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  await db.$transaction([
    db.workspace.update({ where: { id: workspace.id }, data: { name: parsed.data.name } }),
    db.generator.updateMany({ where: { workspaceId: workspace.id }, data: { name: parsed.data.name } }),
  ]);

  revalidatePath("/onboarding");
  return { success: true };
}

export async function updateGeneratorInfo(input: unknown): Promise<ActionResult> {
  const parsed = generatorInfoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, permissions } = await requireWorkspace();
  try {
    requirePermission(permissions, "settings.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  const { ownerName, phone, region, address } = parsed.data;

  await db.$transaction([
    db.workspace.update({ where: { id: workspace.id }, data: { region, address } }),
    db.generator.updateMany({
      where: { workspaceId: workspace.id },
      data: { ownerName, phone, region, address },
    }),
  ]);

  revalidatePath("/onboarding");
  return { success: true };
}

export async function savePricePerAmpere(input: unknown): Promise<ActionResult> {
  const parsed = pricePerAmpereSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, user, permissions } = await requireWorkspace();
  try {
    requirePermission(permissions, "settings.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const before = await db.workspace.findUnique({
    where: { id: workspace.id },
    select: { normalAmperePriceIQD: true, goldAmperePriceIQD: true },
  });

  await db.$transaction([
    db.workspace.update({
      where: { id: workspace.id },
      data: {
        normalAmperePriceIQD: parsed.data.normalAmperePriceIQD,
        goldAmperePriceIQD: parsed.data.goldAmperePriceIQD,
      },
    }),
    db.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "workspace.ampere_price_change",
        entity: "Workspace",
        entityId: workspace.id,
        before: { normalAmperePriceIQD: before?.normalAmperePriceIQD?.toString(), goldAmperePriceIQD: before?.goldAmperePriceIQD?.toString() },
        after: { normalAmperePriceIQD: parsed.data.normalAmperePriceIQD, goldAmperePriceIQD: parsed.data.goldAmperePriceIQD },
      },
    }),
  ]);

  revalidatePath("/onboarding");
  revalidatePath("/settings");
  return { success: true };
}

export async function completeOnboarding(): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  await db.workspace.update({ where: { id: workspace.id }, data: { onboardedAt: new Date() } });
  return { success: true };
}
