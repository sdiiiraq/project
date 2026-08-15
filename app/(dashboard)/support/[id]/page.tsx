import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { ReplyForm } from "@/components/support/reply-form";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { workspace, user } = await requireWorkspace();

  const ticket = await db.supportTicket.findFirst({
    where: { id, workspaceId: workspace.id },
    include: { messages: { where: { isInternalNote: false }, include: { author: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{ticket.subject}</h1>
          <TicketStatusBadge status={ticket.status} />
        </div>
        <p className="text-sm text-muted-foreground">{ticket.category}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">تفاصيل المشكلة</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{ticket.description}</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        {ticket.messages.map((message) => {
          const isMe = message.authorUserId === user.id;
          return (
            <div key={message.id} className={cn("flex flex-col gap-1 rounded-lg border p-3 text-sm", isMe ? "bg-primary/5" : "bg-muted/30")}>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{message.author.fullName}</span>
                <span>{formatDateTime(message.createdAt)}</span>
              </div>
              <p>{message.body}</p>
            </div>
          );
        })}
      </div>

      {ticket.status !== "CLOSED" && <ReplyForm ticketId={ticket.id} />}
    </div>
  );
}
