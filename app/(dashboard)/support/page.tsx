import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { CreateTicketDialog } from "@/components/support/create-ticket-dialog";
import { TicketStatusBadge } from "@/components/support/ticket-status-badge";
import { LifeBuoy, ChevronLeft } from "lucide-react";
import { formatDate } from "@/lib/utils/date";
import { Pagination } from "@/components/shared/pagination";

const PAGE_SIZE = 20;

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const { workspace } = await requireWorkspace();
  const page = Math.max(1, Number(pageParam) || 1);

  // كانت تُحمّل كل تذاكر المولدة بلا أي حد — وهي تنمو باستمرار ولا تتقلّص.
  const where = { workspaceId: workspace.id };
  const [total, tickets] = await Promise.all([
    db.supportTicket.count({ where }),
    db.supportTicket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الدعم الفني</h1>
          <p className="text-sm text-muted-foreground">{total} تذكرة</p>
        </div>
        <CreateTicketDialog />
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <LifeBuoy className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد تذاكر دعم بعد</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/support/${ticket.id}`}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium">{ticket.subject}</p>
                    <p className="text-xs text-muted-foreground">{ticket.category} · {formatDate(ticket.createdAt)}</p>
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

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/support" searchParams={{}} />
    </div>
  );
}
