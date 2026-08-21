import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils/date";
import { Pagination } from "@/components/shared/pagination";
import { estimatedRowCount } from "@/lib/domain/table-stats";
import { ScrollText } from "lucide-react";

const PAGE_SIZE = 50;

// سجل التدقيق مرشّح ليكون أكبر جدول في المنصّة — يُقرأ مُصفَّحًا دائمًا،
// وبأعمدة محددة بدل include كامل للمستخدم والمولدة.
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  // عدد تقريبي عمدًا: COUNT(*) بلا شرط على سجل التدقيق يعني فحصًا كاملًا للجدول
  // في كل تحميل صفحة — وهو الجدول الأسرع نموًا في المنصّة.
  const [total, logs] = await Promise.all([
    estimatedRowCount("auditLogs"),
    db.auditLog.findMany({
      select: {
        id: true,
        createdAt: true,
        action: true,
        entity: true,
        actor: { select: { fullName: true } },
        workspace: { select: { name: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">سجل التدقيق</h1>
        <p className="text-sm text-muted-foreground">نحو {total.toLocaleString("ar-IQ")} عملية عبر جميع المولدات</p>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <ScrollText className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد سجلات بعد</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الوقت</TableHead>
              <TableHead>المولدة</TableHead>
              <TableHead>المستخدم</TableHead>
              <TableHead>الإجراء</TableHead>
              <TableHead>الكيان</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(log.createdAt)}</TableCell>
                <TableCell>{log.workspace?.name ?? "—"}</TableCell>
                <TableCell>{log.actor?.fullName ?? "—"}</TableCell>
                <TableCell>{log.action}</TableCell>
                <TableCell>{log.entity}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/admin/audit" searchParams={{}} />
    </div>
  );
}
