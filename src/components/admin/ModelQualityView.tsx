"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { ModelQualityMetrics } from "@/lib/admin/model-quality";

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function groupToChartData(group: Record<string, number>) {
  return Object.entries(group).map(([name, accuracy]) => ({ name, accuracy: Math.round(accuracy * 100) }));
}

export function ModelQualityView({ metrics }: { metrics: ModelQualityMetrics }) {
  return (
    <div className="space-y-6">
      <h1 className="text-lg font-bold text-gray-900">Model Quality Dashboard</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Total reviewed" value={String(metrics.totalReviewed)} />
        <MetricCard label="Correct" value={pct(metrics.pctCorrect)} />
        <MetricCard label="Partially correct" value={pct(metrics.pctPartiallyCorrect)} />
        <MetricCard label="Incorrect" value={pct(metrics.pctIncorrect)} />
        <MetricCard label="Unclear/not food" value={pct(metrics.pctUnclearOrNotFood)} />
        <MetricCard label="Suggestion edit rate" value={pct(metrics.suggestionEditRate)} />
        <MetricCard label="Protein accuracy" value={pct(metrics.proteinAccuracy)} />
        <MetricCard label="Veg/fiber accuracy" value={pct(metrics.vegetableFiberAccuracy)} />
        <MetricCard label="Carb status accuracy" value={pct(metrics.carbAccuracy)} />
        <MetricCard label="Balanced plate accuracy" value={pct(metrics.balancedPlateAccuracy)} />
        <MetricCard label="Healthier direction accuracy" value={pct(metrics.healthierDirectionAccuracy)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ChartCard title="Accuracy by model version" data={groupToChartData(metrics.accuracyByModelVersion)} />
        <ChartCard title="Accuracy by prompt version" data={groupToChartData(metrics.accuracyByPromptVersion)} />
        <ChartCard title="Accuracy by meal type" data={groupToChartData(metrics.accuracyByMealType)} />
        <ChartCard title="Accuracy by market" data={groupToChartData(metrics.accuracyByMarket)} />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4">
        <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-3">
          Most commonly misclassified foods
        </p>
        {metrics.mostCommonlyMisclassifiedFoods.length === 0 ? (
          <p className="text-sm text-gray-400">No misclassifications recorded yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {metrics.mostCommonlyMisclassifiedFoods.map((f) => (
              <li key={f.food} className="flex justify-between text-gray-700">
                <span>{f.food}</span>
                <span className="text-gray-400">{f.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xl font-bold text-[var(--color-dashboard-primary)]">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function ChartCard({ title, data }: { title: string; data: Array<{ name: string; accuracy: number }> }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-3">{title}</p>
      {data.length === 0 ? (
        <p className="text-sm text-gray-400">No data yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: unknown) => `${v}%`} />
            <Bar dataKey="accuracy" fill="var(--color-dashboard-primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
