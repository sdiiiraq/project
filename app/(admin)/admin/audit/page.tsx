import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ScrollText } from "lucide-react";

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ar-IQ", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default async function AdminAuditPage() {
  const logs = await db.auditLog.findMany({
    include: { actor: true, workspace: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">سجل التدقيق</h1>
        <p className="text-sm text-muted-foreground">آخر 100 عملية عبر جميع المولدات</p>
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
    </div>
  );
}
