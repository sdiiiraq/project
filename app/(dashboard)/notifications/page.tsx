import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck } from "lucide-react";
import { markAllNotificationsRead } from "@/lib/actions/notification.actions";
import { NotificationRow } from "./notification-row";
import { formatDateTime } from "@/lib/utils/date";
import { Pagination } from "@/components/shared/pagination";

const PAGE_SIZE = 50;

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const { workspace, user } = await requireWorkspace();
  const page = Math.max(1, Number(pageParam) || 1);

  const where = { workspaceId: workspace.id, OR: [{ userId: user.id }, { userId: null }] };
  const [total, notifications] = await Promise.all([
    db.notification.count({ where }),
    db.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الإشعارات</h1>
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

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/notifications" searchParams={{}} />
    </div>
  );
}
