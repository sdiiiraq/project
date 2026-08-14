"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatMoney } from "@/lib/utils/money";

export function MoneyBarChart({ data, dataKey }: { data: Record<string, string | number>[]; dataKey: string }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(220 15% 90%)" />
        <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis fontSize={12} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
        <Tooltip formatter={(value: number) => formatMoney(value)} contentStyle={{ borderRadius: 8, direction: "rtl", fontSize: 13 }} />
        <Bar dataKey={dataKey} fill="hsl(27 96% 53%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
