import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac/access";
import { getReportPage, REPORT_MAX_RANGE_DAYS } from "@/lib/domain/reports";
import { REPORT_LABELS, type ReportType } from "@/lib/domain/report-types";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";
import { Pagination } from "@/components/shared/pagination";
import { PageHelp } from "@/components/help/page-help";

function firstDayOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; from?: string; to?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { workspace, permissions } = await requireWorkspace();
  requirePermission(permissions, "reports.read");

  const type = (params.type && params.type in REPORT_LABELS ? params.type : "collection") as ReportType;
  const from = params.from ?? firstDayOfMonth();
  const to = params.to ?? today();
  const page = Math.max(1, Number(params.page) || 1);

  const report = await getReportPage(
    workspace.id,
    type,
    { from: new Date(`${from}T00:00:00.000Z`), to: new Date(`${to}T23:59:59.999Z`) },
    { page },
  );

  const extraParams = { type, from, to };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">التقارير</h1>
          <p className="text-sm text-muted-foreground">
            تقرير {REPORT_LABELS[type]}
            {report.paginated ? ` — ${report.total} سجل` : ""}
          </p>
        </div>
        <PageHelp pageKey="reports" />
      </div>

      <ReportFilters type={type} from={from} to={to} />

      {report.rangeClamped && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-sm">
          المدى المطلوب أوسع من الحد المسموح ({REPORT_MAX_RANGE_DAYS} يومًا). عُرضت آخر {REPORT_MAX_RANGE_DAYS} يومًا
          حتى تاريخ النهاية المحدد.
        </p>
      )}

      <ReportTable
        columns={report.columns}
        rows={report.rows}
        exportHref={`/api/reports/export?type=${type}&from=${from}&to=${to}`}
      />

      {report.paginated && (
        <Pagination
          page={report.page}
          pageSize={report.pageSize}
          total={report.total}
          basePath="/reports"
          searchParams={extraParams}
        />
      )}
    </div>
  );
}
