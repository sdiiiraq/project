"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import { endOperatingSessionSchema, updateOperatingSessionSchema } from "@/lib/validation/operations";
import { syncSessionFuelUsage } from "@/lib/domain/fuel";

export type ActionResult = { error: string } | { success: true };

export async function startOperatingSession(): Promise<ActionResult> {
  const { workspace, permissions } = await requireWorkspace();
  try {
    requirePermission(permissions, "generator.manage");
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

  const { workspace, permissions } = await requireWorkspace();
  try {
    requirePermission(permissions, "generator.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const session = await db.operatingSession.findFirst({ where: { id: parsed.data.sessionId, workspaceId: workspace.id } });
  if (!session) return { error: "الجلسة غير موجودة." };
  if (session.endTime) return { error: "هذه الجلسة مغلقة بالفعل." };

  const generator = await db.generator.findFirst({ where: { id: session.generatorId } });

  const endTime = new Date();
  const operatingHours = (endTime.getTime() - session.startTime.getTime()) / (1000 * 60 * 60);

  await db.$transaction(async (tx) => {
    await tx.operatingSession.update({
      where: { id: session.id },
      data: {
        endTime,
        operatingHours,
        downtimeMinutes: parsed.data.downtimeMinutes,
        downtimeReason: parsed.data.downtimeReason,
      },
    });

    await syncSessionFuelUsage(tx, {
      workspaceId: workspace.id,
      sessionId: session.id,
      operatingHours,
      date: endTime,
      ratePerHour: generator?.fuelConsumptionPerHour ? Number(generator.fuelConsumptionPerHour) : null,
    });
  });

  revalidatePath("/maintenance");
  revalidatePath("/operating-sessions");
  revalidatePath("/fuel");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function updateOperatingSession(input: unknown): Promise<ActionResult> {
  const parsed = updateOperatingSessionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };

  const { workspace, permissions, user } = await requireWorkspace();
  try {
    requirePermission(permissions, "generator.manage");
  } catch (e) {
    if (e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }

  const session = await db.operatingSession.findFirst({ where: { id: parsed.data.sessionId, workspaceId: workspace.id } });
  if (!session) return { error: "الجلسة غير موجودة." };
  if (!session.endTime) return { error: "لا يمكن تعديل جلسة لم تنتهِ بعد — يجب إيقافها أولًا." };

  const generator = await db.generator.findFirst({ where: { id: session.generatorId } });

  const operatingHours = (parsed.data.endTime.getTime() - parsed.data.startTime.getTime()) / (1000 * 60 * 60);

  await db.$transaction(async (tx) => {
    await tx.operatingSession.update({
      where: { id: session.id },
      data: {
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        operatingHours,
        downtimeMinutes: parsed.data.downtimeMinutes,
        downtimeReason: parsed.data.downtimeReason,
      },
    });

    await syncSessionFuelUsage(tx, {
      workspaceId: workspace.id,
      sessionId: session.id,
      operatingHours,
      date: parsed.data.endTime,
      ratePerHour: generator?.fuelConsumptionPerHour ? Number(generator.fuelConsumptionPerHour) : null,
    });

    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        actorUserId: user.id,
        action: "operations.session_update",
        entity: "OperatingSession",
        entityId: session.id,
        before: {
          startTime: session.startTime.toISOString(),
          endTime: session.endTime?.toISOString() ?? null,
          operatingHours: session.operatingHours ? Number(session.operatingHours) : null,
        },
        after: {
          startTime: parsed.data.startTime.toISOString(),
          endTime: parsed.data.endTime.toISOString(),
          operatingHours,
        },
      },
    });
  });

  revalidatePath("/maintenance");
  revalidatePath("/operating-sessions");
  revalidatePath("/fuel");
  revalidatePath("/dashboard");
  return { success: true };
}
