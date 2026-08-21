import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission, ForbiddenError } from "@/lib/rbac/access";
import { REPORT_LABELS, type ReportType } from "@/lib/domain/report-types";
import { reportColumns, streamReportRows, clampRange, REPORT_MAX_EXPORT_ROWS } from "@/lib/domain/reports";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MONEY_KEYS = new Set(["amount", "paid", "outstanding", "totalCost", "pricePerLiter", "cost"]);

const querySchema = z.object({
  type: z.enum(Object.keys(REPORT_LABELS) as [ReportType, ...ReportType[]]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة تاريخ البداية غير صحيحة."),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة تاريخ النهاية غير صحيحة."),
});

function csvCell(value: string | number | undefined, key: string): string {
  const normalized = MONEY_KEYS.has(key) && typeof value === "number" ? Math.round(value) : (value ?? "");
  return `"${String(normalized).replace(/"/g, '""')}"`;
}

/**
 * تصدير CSV من جهة الخادم، على شكل stream.
 *
 * الزر السابق كان يبني الملف في المتصفح من الصفوف المعروضة فقط — مع تصفيح التقارير
 * كان سيُصدّر الصفحة الحالية فقط بصمت. هنا يُبنى الملف من قاعدة البيانات مباشرة على دفعات:
 * لا تُحمَّل أكثر من دفعة واحدة في الذاكرة، ولا في الخادم ولا في المتصفح.
 */
export async function GET(request: NextRequest) {
  const { workspace, permissions } = await requireWorkspace();

  try {
    requirePermission(permissions, "reports.read");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "طلب غير صحيح." }, { status: 400 });
  }

  const from = new Date(`${parsed.data.from}T00:00:00.000Z`);
  const to = new Date(`${parsed.data.to}T23:59:59.999Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "المدى التاريخي غير صالح." }, { status: 400 });
  }

  const { range } = clampRange({ from, to });
  const type = parsed.data.type;
  const columns = reportColumns(type);

  // workspace.id يأتي من requireWorkspace فقط — لا يمكن للعميل تمرير workspaceId إطلاقًا.
  const workspaceId = workspace.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // BOM حتى يفتح Excel العربية بترميز صحيح.
        controller.enqueue(encoder.encode("﻿"));
        controller.enqueue(encoder.encode(`${columns.map((c) => c.label).join(",")}\n`));

        for await (const batch of streamReportRows(workspaceId, type, range)) {
          const chunk = batch
            .map((row) => columns.map((c) => csvCell(row[c.key], c.key)).join(","))
            .join("\n");
          controller.enqueue(encoder.encode(`${chunk}\n`));
        }
        controller.close();
      } catch (error) {
        console.error("[reports/export] stream failed", { workspaceId, type, error });
        controller.error(error);
      }
    },
  });

  const fileName = `${type}-${parsed.data.from}-${parsed.data.to}.csv`;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
      "X-Max-Rows": String(REPORT_MAX_EXPORT_ROWS),
    },
  });
}
