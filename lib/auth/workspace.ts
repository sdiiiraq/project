import "server-only";
import { db } from "@/lib/db";

// يُستدعى بعد أول تسجيل دخول (Google أو Email أو Phone). يضمن عدم إنشاء Workspace مكرر
// إذا كان المستخدم عضوًا في Workspace أصلًا.
export async function ensureApplicationUser(params: {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
}) {
  return db.user.upsert({
    where: { id: params.id },
    update: {
      fullName: params.fullName,
      email: params.email ?? undefined,
      phone: params.phone ?? undefined,
    },
    create: {
      id: params.id,
      fullName: params.fullName,
      email: params.email ?? null,
      phone: params.phone ?? null,
    },
  });
}

export async function getUserPrimaryWorkspaceId(userId: string): Promise<string | null> {
  const membership = await db.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  return membership?.workspaceId ?? null;
}
