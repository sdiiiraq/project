"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { formatMoney } from "@/lib/utils/money";

const COLORS = ["hsl(27 96% 53%)", "hsl(222 30% 40%)", "hsl(142 71% 40%)", "hsl(38 92% 50%)", "hsl(0 72% 55%)", "hsl(220 15% 65%)", "hsl(280 60% 55%)", "hsl(190 70% 45%)", "hsl(340 70% 55%)"];

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
        <Tooltip formatter={(value: number) => formatMoney(value)} contentStyle={{ borderRadius: 8, direction: "rtl", fontSize: 13 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
