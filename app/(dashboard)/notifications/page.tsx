import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck } from "lucide-react";
import { markAllNotificationsRead } from "@/lib/actions/notification.actions";
import { NotificationRow } from "./notification-row";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function NotificationsPage() {
  const { workspace, user } = await requireWorkspace();

  const notifications = await db.notification.findMany({
    where: { workspaceId: workspace.id, OR: [{ userId: user.id }, { userId: null }] },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">الإشعارات</h1>
        {hasUnread && (
          <form action={markAllNotificationsRead}>
            <Button type="submit" variant="outline" size="sm">
              <CheckCheck className="h-4 w-4" /> تعليم الكل كمقروء
            </Button>
          </form>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Bell className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد إشعارات بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {notifications.map((n) => (
            <NotificationRow
              key={n.id}
              id={n.id}
              title={n.title}
              body={n.body}
              read={!!n.readAt}
              date={formatDateTime(n.createdAt)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
