"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatMoney } from "@/lib/utils/money";

export function RevenueTrendChart({ data }: { data: { month: string; المطلوب: number; المحصّل: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorDue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(220 15% 60%)" stopOpacity={0.3} />
            <stop offset="95%" stopColor="hsl(220 15% 60%)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(27 96% 53%)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="hsl(27 96% 53%)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(220 15% 90%)" />
        <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis fontSize={12} tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
        <Tooltip formatter={(value: number) => formatMoney(value)} contentStyle={{ borderRadius: 8, direction: "rtl", fontSize: 13 }} />
        <Area type="monotone" dataKey="المطلوب" stroke="hsl(220 15% 55%)" fill="url(#colorDue)" strokeWidth={2} />
        <Area type="monotone" dataKey="المحصّل" stroke="hsl(27 96% 53%)" fill="url(#colorCollected)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
