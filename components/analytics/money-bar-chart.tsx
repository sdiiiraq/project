"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatMoney } from "@/lib/utils/money";

export function MoneyBarChart({ data, dataKey }: { data: Record<string, string | number>[]; dataKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} tick={{ fill: "hsl(var(--muted-foreground))" }} />
        <YAxis
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={40}
          tick={{ fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => `${Math.round(v / 1000)}K`}
        />
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
          labelStyle={{ color: "hsl(var(--foreground))" }}
          cursor={{ fill: "hsl(var(--muted))" }}
        />
        <Bar dataKey={dataKey} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
