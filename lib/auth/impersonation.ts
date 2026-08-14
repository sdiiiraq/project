import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

const COOKIE_NAME = "ampere_impersonation";

// لا نستخدم جلسة تسجيل دخول حقيقية للمستخدم المستهدف. الكوكي يحمل فقط معرّف سجل
// AdminImpersonation، ويُعاد التحقق من ملكيته لنفس المشرف الحالي وأنه غير منتهٍ في كل طلب.
export async function getActiveImpersonation(adminUserId: string) {
  const cookieStore = await cookies();
  const impersonationId = cookieStore.get(COOKIE_NAME)?.value;
  if (!impersonationId) return null;

  const record = await db.adminImpersonation.findFirst({
    where: { id: impersonationId, adminUserId, endedAt: null },
    include: { workspace: true },
  });

  return record;
}

export async function setImpersonationCookie(impersonationId: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, impersonationId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

export async function clearImpersonationCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
