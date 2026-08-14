import "server-only";
import { db } from "@/lib/db";

type NotificationType = "PAYMENT" | "DEBT" | "COLLECTOR_SETTLEMENT" | "SUBSCRIPTION" | "MAINTENANCE" | "SYSTEM";

// طبقة تجريد للإشعارات — لا تُقيَّد بمزوّد واحد. حاليًا تُخزَّن في قاعدة البيانات فقط
// (Notification Center)، وبنيتها تسمح لاحقًا بإضافة Email/WhatsApp/SMS/Push دون تغيير نقاط الاستدعاء.
export async function notifyWorkspace(params: {
  workspaceId: string;
  userId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
}) {
  await db.notification.create({
    data: {
      workspaceId: params.workspaceId,
      userId: params.userId ?? null,
      type: params.type,
      title: params.title,
      body: params.body,
    },
  });
}
