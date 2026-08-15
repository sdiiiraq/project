import Link from "next/link";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "./user-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { db } from "@/lib/db";

export async function Header({
  workspaceName,
  fullName,
  email,
  workspaceId,
  userId,
  isPlatformAdmin = false,
}: {
  workspaceName: string;
  fullName: string;
  email?: string | null;
  workspaceId: string;
  userId: string;
  isPlatformAdmin?: boolean;
}) {
  const unreadCount = await db.notification.count({
    where: { workspaceId, OR: [{ userId }, { userId: null }], readAt: null },
  });

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card/70 px-4 backdrop-blur-md lg:px-6">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{workspaceName}</p>
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <Link
          href="/notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
        >
          <Bell className="h-[18px] w-[18px]" />
          {unreadCount > 0 && (
            <Badge variant="destructive" className="absolute -left-1 -top-1 h-4 min-w-4 justify-center px-1 py-0 text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Link>
        <UserMenu fullName={fullName} email={email} isPlatformAdmin={isPlatformAdmin} />
      </div>
    </header>
  );
}
