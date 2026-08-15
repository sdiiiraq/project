"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import {
  pricePerAmpereSchema,
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

export async function savePricePerAmpere(input: unknown): Promise<ActionResult> {
  const parsed = pricePerAmpereSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace } = await requireWorkspace();

  await db.workspace.update({
    where: { id: workspace.id },
    data: { amperePriceIQD: parsed.data.amperePriceIQD },
  });

  revalidatePath("/onboarding");
  revalidatePath("/settings");
  return { success: true };
}

export async function completeOnboarding(): Promise<ActionResult> {
  const { workspace } = await requireWorkspace();
  await db.workspace.update({ where: { id: workspace.id }, data: { onboardedAt: new Date() } });
  return { success: true };
}
