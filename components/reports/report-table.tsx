"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, Printer } from "lucide-react";
import { formatMoney } from "@/lib/utils/money";

const MONEY_KEYS = new Set(["amount", "paid", "outstanding", "totalCost", "pricePerLiter", "cost", "expected", "actual", "difference"]);

export function ReportTable({
  columns,
  rows,
  fileName,
}: {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number>[];
  fileName: string;
}) {
  function exportCsv() {
    const header = columns.map((c) => c.label).join(",");
    const body = rows
      .map((row) =>
        columns
          .map((c) => {
            const cell = row[c.key];
            const value = MONEY_KEYS.has(c.key) && typeof cell === "number" ? Math.round(cell) : (cell ?? "");
            return `"${String(value).replace(/"/g, '""')}"`;
          })
          .join(","),
      )
      .join("\n");
    const csv = `﻿${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${fileName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="h-4 w-4" /> تصدير CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()} disabled={rows.length === 0}>
          <Printer className="h-4 w-4" /> طباعة
        </Button>
      </div>

      <Card className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">لا توجد بيانات ضمن هذا النطاق</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-muted-foreground">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className="whitespace-nowrap px-4 py-2.5 text-start font-medium">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => {
                    const cell = row[c.key] ?? "—";
                    return (
                      <td key={c.key} className="whitespace-nowrap px-4 py-2.5">
                        {MONEY_KEYS.has(c.key) && typeof cell === "number" ? formatMoney(cell) : cell}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
