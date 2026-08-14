"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/auth/session";

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { workspace } = await requireWorkspace();
  const notification = await db.notification.findFirst({ where: { id: notificationId, workspaceId: workspace.id } });
  if (!notification) return;

  await db.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead(): Promise<void> {
  const { workspace, user } = await requireWorkspace();
  await db.notification.updateMany({
    where: { workspaceId: workspace.id, OR: [{ userId: user.id }, { userId: null }], readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}
