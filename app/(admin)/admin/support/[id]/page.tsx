import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { AdminReplyForm } from "@/components/support/admin-reply-form";
import { AdminTicketStatusSelect } from "@/components/admin/ticket-status-select";
import { cn } from "@/lib/utils";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function AdminTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ticket = await db.supportTicket.findUnique({
    where: { id },
    include: {
      workspace: true,
      createdBy: true,
      messages: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{ticket.subject}</h1>
            <TicketStatusBadge status={ticket.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            <Link href={`/admin/workspaces/${ticket.workspaceId}`} className="hover:underline">
              {ticket.workspace.name}
            </Link>{" "}
            · {ticket.createdBy.fullName} · {ticket.category}
          </p>
        </div>
        <AdminTicketStatusSelect ticketId={ticket.id} status={ticket.status} />
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
        {ticket.messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex flex-col gap-1 rounded-lg border p-3 text-sm",
              message.isInternalNote ? "border-warning/40 bg-warning/5" : "bg-muted/30",
            )}
          >
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{message.author.fullName} {message.isInternalNote && "(ملاحظة داخلية)"}</span>
              <span>{formatDateTime(message.createdAt)}</span>
            </div>
            <p>{message.body}</p>
          </div>
        ))}
      </div>

      <AdminReplyForm ticketId={ticket.id} />
    </div>
  );
}
