import Link from "next/link";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { LifeBuoy, ChevronLeft } from "lucide-react";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("ar-IQ", { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export default async function AdminSupportPage() {
  const tickets = await db.supportTicket.findMany({
    include: { workspace: true, createdBy: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">الدعم الفني</h1>
        <p className="text-sm text-muted-foreground">{tickets.length} تذكرة عبر جميع المولدات</p>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <LifeBuoy className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد تذاكر بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/admin/support/${ticket.id}`}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground">
                      {ticket.workspace.name} · {ticket.createdBy.fullName} · {formatDate(ticket.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <TicketStatusBadge status={ticket.status} />
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
