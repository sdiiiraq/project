"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { REPORT_LABELS, type ReportType } from "@/lib/domain/report-types";

export function ReportFilters({ type, from, to }: { type: ReportType; from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-end gap-3 print:hidden">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">نوع التقرير</label>
        <Select value={type} onValueChange={(v) => update("type", v)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(REPORT_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">من تاريخ</label>
        <Input type="date" value={from} onChange={(e) => update("from", e.target.value)} className="w-40" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">إلى تاريخ</label>
        <Input type="date" value={to} onChange={(e) => update("to", e.target.value)} className="w-40" />
      </div>
    </div>
  );
}
