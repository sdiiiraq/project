import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { HelpGuideFormDialog } from "@/components/admin/help-guide-form-dialog";
import { HelpGuideStatusToggle, DeleteHelpGuideButton } from "@/components/admin/help-guide-row-actions";
import { helpPageLabel } from "@/lib/help-pages";
import { GraduationCap } from "lucide-react";

export default async function AdminHelpGuidesPage() {
  const guides = await db.helpGuide.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">الشروحات والتعليمات</h1>
          <p className="text-sm text-muted-foreground">فيديوهات شرح مرتبطة بصفحات التطبيق — جوال وكمبيوتر لكل صفحة.</p>
        </div>
        <HelpGuideFormDialog />
      </div>

      {guides.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <GraduationCap className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">لا توجد شروحات بعد</p>
            <p className="text-sm text-muted-foreground">أضف أول شرح ليظهر للمستخدمين في الصفحة المرتبطة به.</p>
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>اسم الشرح</TableHead>
              <TableHead>الصفحة</TableHead>
              <TableHead>الجوال</TableHead>
              <TableHead>الكمبيوتر</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead>الإجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {guides.map((guide) => (
              <TableRow key={guide.id}>
                <TableCell className="font-medium">{guide.title}</TableCell>
                <TableCell className="text-muted-foreground">{helpPageLabel(guide.pageKey)}</TableCell>
                <TableCell className="text-muted-foreground">{guide.mobileVideoId ? "✓" : "—"}</TableCell>
                <TableCell className="text-muted-foreground">{guide.desktopVideoId ? "✓" : "—"}</TableCell>
                <TableCell>
                  <HelpGuideStatusToggle id={guide.id} enabled={guide.enabled} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <HelpGuideFormDialog
                      guide={{
                        id: guide.id,
                        pageKey: guide.pageKey,
                        title: guide.title,
                        description: guide.description ?? "",
                        mobileVideoUrl: guide.mobileVideoUrl ?? "",
                        desktopVideoUrl: guide.desktopVideoUrl ?? "",
                        enabled: guide.enabled,
                      }}
                    />
                    <DeleteHelpGuideButton id={guide.id} title={guide.title} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
