"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import {
  amperePlansSchema,
  generatorInfoSchema,
  generatorNameSchema,
} from "@/lib/validation/onboarding";

export type ActionResult = { error: string } | { success: true };

export async function updateGeneratorName(input: unknown): Promise<ActionResult> {
  const parsed = generatorNameSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace } = await requireWorkspace();

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

  const { workspace } = await requireWorkspace();
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

export async function saveAmperePlans(input: unknown): Promise<ActionResult> {
  const parsed = amperePlansSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace } = await requireWorkspace();

  await db.$transaction(
    parsed.data.plans.map((plan) =>
      db.amperePlan.upsert({
        where: { workspaceId_amperes_isCustom: { workspaceId: workspace.id, amperes: plan.amperes, isCustom: false } },
        update: { monthlyPrice: plan.monthlyPrice, isActive: true },
        create: { workspaceId: workspace.id, amperes: plan.amperes, monthlyPrice: plan.monthlyPrice },
      }),
    ),
  );

  revalidatePath("/onboarding");
  return { success: true };
}

export async function completeOnboarding(): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  await db.workspace.update({ where: { id: workspace.id }, data: { onboardedAt: new Date() } });
  return { success: true };
}
