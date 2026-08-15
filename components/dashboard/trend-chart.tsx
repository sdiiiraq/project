"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatMoney } from "@/lib/utils/money";

export function RevenueTrendChart({ data }: { data: { month: string; المطلوب: number; المحصّل: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorDue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorCollected" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
            <stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="month"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))" }}
        />
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
        />
        <Area type="monotone" dataKey="المطلوب" stroke="hsl(var(--primary))" fill="url(#colorDue)" strokeWidth={2} />
        <Area type="monotone" dataKey="المحصّل" stroke="hsl(var(--success))" fill="url(#colorCollected)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
