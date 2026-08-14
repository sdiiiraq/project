import { requireWorkspace } from "@/lib/auth/session";
import { requirePermission } from "@/lib/rbac/access";
import { getReportData } from "@/lib/domain/reports";
import { REPORT_LABELS, type ReportType } from "@/lib/domain/report-types";
import { ReportFilters } from "@/components/reports/report-filters";
import { ReportTable } from "@/components/reports/report-table";

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
  searchParams: Promise<{ type?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const { workspace, role } = await requireWorkspace();
  requirePermission(role, "reports.read");

  const type = (params.type && params.type in REPORT_LABELS ? params.type : "collection") as ReportType;
  const from = params.from ?? firstDayOfMonth();
  const to = params.to ?? today();

  const { columns, rows } = await getReportData(workspace.id, type, {
    from: new Date(`${from}T00:00:00.000Z`),
    to: new Date(`${to}T23:59:59.999Z`),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">التقارير</h1>
        <p className="text-sm text-muted-foreground">تقرير {REPORT_LABELS[type]}</p>
      </div>

      <ReportFilters type={type} from={from} to={to} />
      <ReportTable columns={columns} rows={rows} fileName={`${type}-${from}-${to}`} />
    </div>
  );
}
