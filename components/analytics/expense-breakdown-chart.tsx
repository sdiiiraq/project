"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatMoney } from "@/lib/utils/money";

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--cyan))",
  "hsl(var(--brand-accent))",
  "hsl(var(--success))",
  "hsl(var(--destructive))",
  "hsl(280 60% 60%)",
  "hsl(340 70% 60%)",
  "hsl(214 28% 66%)",
];

export function ExpenseBreakdownChart({ data }: { data: { name: string; value: number }[] }) {
  if (data.length === 0) {
    return <p className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">لا توجد مصاريف بعد</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
          {data.map((_, index) => (
            <Cell key={index} fill={COLORS[index % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatMoney(value)}
          contentStyle={{
            borderRadius: 12,
            direction: "rtl",
            fontSize: 13,
            background: "hsl(var(--popover))",
            border: "1px solid hsl(var(--border))",
            color: "hsl(var(--popover-foreground))",
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
