import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
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
        <h1 className="text-xl font-bold">سجل التدقيق</h1>
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
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-start font-medium">الوقت</th>
                <th className="px-4 py-2.5 text-start font-medium">المولدة</th>
                <th className="px-4 py-2.5 text-start font-medium">المستخدم</th>
                <th className="px-4 py-2.5 text-start font-medium">الإجراء</th>
                <th className="px-4 py-2.5 text-start font-medium">الكيان</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="whitespace-nowrap px-4 py-2.5">{formatDateTime(log.createdAt)}</td>
                  <td className="px-4 py-2.5">{log.workspace?.name ?? "—"}</td>
                  <td className="px-4 py-2.5">{log.actor?.fullName ?? "—"}</td>
                  <td className="px-4 py-2.5">{log.action}</td>
                  <td className="px-4 py-2.5">{log.entity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
