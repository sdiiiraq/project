"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/session";
import { extractYouTubeVideoId } from "@/lib/utils/youtube";
import { upsertHelpGuideSchema, toggleHelpGuideSchema, deleteHelpGuideSchema } from "@/lib/validation/help";

export type ActionResult = { error: string } | { success: true };

async function logAdminAction(adminUserId: string, action: string, entityId: string, after?: unknown) {
  await db.auditLog.create({
    data: { actorUserId: adminUserId, action, entity: "HelpGuide", entityId, after: after as never },
  });
}

export async function upsertHelpGuide(input: unknown): Promise<ActionResult> {
  const parsed = upsertHelpGuideSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  const admin = await requirePlatformAdmin();

  const { id, pageKey, title, description, mobileVideoUrl, desktopVideoUrl, enabled } = parsed.data;
  const data = {
    pageKey,
    title,
    description: description || null,
    mobileVideoUrl: mobileVideoUrl || null,
    mobileVideoId: mobileVideoUrl ? extractYouTubeVideoId(mobileVideoUrl) : null,
    desktopVideoUrl: desktopVideoUrl || null,
    desktopVideoId: desktopVideoUrl ? extractYouTubeVideoId(desktopVideoUrl) : null,
    enabled,
  };

  const guide = id
    ? await db.helpGuide.update({ where: { id }, data })
    : await db.helpGuide.create({ data });

  await logAdminAction(admin.id, id ? "admin.help_guide_update" : "admin.help_guide_create", guide.id, data);

  revalidatePath("/admin/help-guides");
  return { success: true };
}

export async function toggleHelpGuide(input: unknown): Promise<ActionResult> {
  const parsed = toggleHelpGuideSchema.safeParse(input);
  if (!parsed.success) return { error: "بيانات غير صحيحة" };
  const admin = await requirePlatformAdmin();

  await db.helpGuide.update({ where: { id: parsed.data.id }, data: { enabled: parsed.data.enabled } });
  await logAdminAction(admin.id, "admin.help_guide_toggle", parsed.data.id, { enabled: parsed.data.enabled });

  revalidatePath("/admin/help-guides");
  return { success: true };
}

export async function deleteHelpGuide(input: unknown): Promise<ActionResult> {
  const parsed = deleteHelpGuideSchema.safeParse(input);
  if (!parsed.success) return { error: "بيانات غير صحيحة" };
  const admin = await requirePlatformAdmin();

  await db.helpGuide.delete({ where: { id: parsed.data.id } });
  await logAdminAction(admin.id, "admin.help_guide_delete", parsed.data.id);

  revalidatePath("/admin/help-guides");
  return { success: true };
}
