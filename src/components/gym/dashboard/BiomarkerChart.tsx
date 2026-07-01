"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Dot } from "recharts";

interface Props {
  data: { date: string; value: number }[];
  color: string;
  unit: string;
}

export function BiomarkerChart({ data, color, unit }: Props) {
  const formatted = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
  }));

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min) * 0.3 || 2;

  return (
    <ResponsiveContainer width="100%" height={80}>
      <LineChart data={formatted} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#d1d5db" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis domain={[min - padding, max + padding]} tick={{ fontSize: 10, fill: "#d1d5db" }} axisLine={false} tickLine={false} />
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className="bg-white border border-gray-100 rounded-xl px-3 py-1.5 shadow-lg text-xs">
                <p className="font-semibold text-gray-900">{d.value}{unit}</p>
                <p className="text-gray-400">{d.label}</p>
              </div>
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={<Dot r={3} fill={color} strokeWidth={0} />}
          activeDot={{ r: 5, fill: color, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
