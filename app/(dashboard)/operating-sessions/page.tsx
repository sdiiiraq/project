import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac/access";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PageHelp } from "@/components/help/page-help";
import { formatDate, formatTime } from "@/lib/utils/date";
import { Zap } from "lucide-react";

export default async function OperatingSessionsPage() {
  const { workspace, permissions } = await requireWorkspace();
  requirePermission(permissions, "generator.manage");

  const generator = await db.generator.findFirst({ where: { workspaceId: workspace.id } });

  const sessions = generator
    ? await db.operatingSession.findMany({
        where: { workspaceId: workspace.id, generatorId: generator.id },
        orderBy: { startTime: "desc" },
        take: 100,
      })
    : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">جلسات التشغيل</h1>
          <p className="text-sm text-muted-foreground">آخر {sessions.length} جلسة تشغيل فعلية للمولدة</p>
        </div>
        <PageHelp pageKey="operating-sessions" />
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Zap className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد جلسات تشغيل مسجّلة بعد</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              اضغط «تشغيل المولدة» من الصفحة الرئيسية لبدء أول جلسة.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>التاريخ</TableHead>
              <TableHead>وقت التشغيل</TableHead>
              <TableHead>وقت الإيقاف</TableHead>
              <TableHead>المدة</TableHead>
              <TableHead>التوقف</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell>{formatDate(session.startTime)}</TableCell>
                <TableCell>{formatTime(session.startTime)}</TableCell>
                <TableCell>{session.endTime ? formatTime(session.endTime) : "قيد التشغيل الآن"}</TableCell>
                <TableCell>
                  {session.operatingHours ? `${Number(session.operatingHours).toFixed(1)} ساعة` : "—"}
                </TableCell>
                <TableCell>
                  {session.downtimeMinutes > 0
                    ? `${session.downtimeMinutes} دقيقة${session.downtimeReason ? ` — ${session.downtimeReason}` : ""}`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
