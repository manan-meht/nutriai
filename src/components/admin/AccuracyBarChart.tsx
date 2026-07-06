"use client";

// Split out from ModelQualityView so recharts can be loaded via
// next/dynamic({ ssr: false }) there, keeping it out of the edge-rendered
// /admin function bundle (mirrors the pattern already used for
// ProteinChart/CalorieChart in src/components/gym/dashboard/MacroCharts.tsx).
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function AccuracyBarChart({ data }: { data: Array<{ name: string; accuracy: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
        <Tooltip formatter={(v: unknown) => `${v}%`} />
        <Bar dataKey="accuracy" fill="var(--color-dashboard-primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
