"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import { endOperatingSessionSchema } from "@/lib/validation/operations";

export type ActionResult = { error: string } | { success: true };

export async function startOperatingSession(): Promise<ActionResult> {
  const { workspace, role } = await requireWorkspace();
  try {
    requirePermission(role, "generator.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const generator = await db.generator.findFirst({ where: { workspaceId: workspace.id } });
  if (!generator) return { error: "لم يتم العثور على بيانات المولدة." };

  const openSession = await db.operatingSession.findFirst({
    where: { workspaceId: workspace.id, generatorId: generator.id, endTime: null },
  });
  if (openSession) return { error: "توجد جلسة تشغيل مفتوحة بالفعل." };

  await db.operatingSession.create({
    data: { workspaceId: workspace.id, generatorId: generator.id, startTime: new Date() },
  });

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function endOperatingSession(input: unknown): Promise<ActionResult> {
  const parsed = endOperatingSessionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, role } = await requireWorkspace();
  try {
    requirePermission(role, "generator.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const session = await db.operatingSession.findFirst({ where: { id: parsed.data.sessionId, workspaceId: workspace.id } });
  if (!session) return { error: "الجلسة غير موجودة." };
  if (session.endTime) return { error: "هذه الجلسة مغلقة بالفعل." };

  const endTime = new Date();
  const operatingHours = (endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60);

  await db.operatingSession.update({
    where: { id: session.id },
    data: {
      endTime,
      operatingHours,
      downtimeMinutes: parsed.data.downtimeMinutes,
      downtimeReason: parsed.data.downtimeReason,
    },
  });

  revalidatePath("/maintenance");
  revalidatePath("/dashboard");
  return { success: true };
}
