"use client";

import { useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { markNotificationRead } from "@/lib/actions/notification.actions";

export function NotificationRow({
  id,
  title,
  body,
  read,
  date,
}: {
  id: string;
  title: string;
  body: string;
  read: boolean;
  date: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Card
      className={cn("cursor-pointer transition-colors", !read && "border-primary/40 bg-primary/5")}
      onClick={() => !read && startTransition(() => markNotificationRead(id))}
    >
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{body}</p>
        </div>
        <span className={cn("shrink-0 text-xs text-muted-foreground", isPending && "opacity-50")}>{date}</span>
      </CardContent>
    </Card>
  );
}
