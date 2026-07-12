"use client";

import { useEffect, useState } from "react";
import type { FoodBalanceScoreResult } from "@nutriai/health-scoring";
import { trackFoodBalanceEvent } from "@/lib/food-balance/analytics";

interface FoodBalanceScoreCardProps {
  contactId: string;
}

const SCORE_BAND_LABEL = [
  { max: 39, label: "Learning and building" },
  { max: 59, label: "Building balance" },
  { max: 79, label: "Supporting your goal" },
  { max: 100, label: "Strong foundation" },
];

function bandLabelFor(score: number): string {
  return SCORE_BAND_LABEL.find((b) => score <= b.max)?.label ?? "Supporting your goal";
}

function confidenceLabel(label: string): string {
  if (label === "high") return "High confidence";
  if (label === "moderate") return "Moderate confidence";
  return "Still learning";
}

// Purple-only meter — never a red/green diagnostic-style gauge, per the
// feature's explicit "not a medical assessment" requirement. A soft 270°
// ring rendered with plain SVG (no new charting dependency), matching how
// MacroBarChart.tsx avoided pulling one in on the mobile side.
function ScoreRing({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius * 0.75; // 270 degrees
  const progress = (score / 100) * circumference;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-hidden="true">
      <g transform="rotate(135 70 70)">
        <circle cx="70" cy="70" r={radius} fill="none" stroke="#EDE9F7" strokeWidth="12" strokeDasharray={`${circumference} 1000`} strokeLinecap="round" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke="#6750A4"
          strokeWidth="12"
          strokeDasharray={`${progress} 1000`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.6s ease" }}
        />
      </g>
      <text x="70" y="76" textAnchor="middle" fontSize="28" fontWeight="700" fill="#111827">
        {score}
      </text>
    </svg>
  );
}

export function FoodBalanceScoreCard({ contactId }: FoodBalanceScoreCardProps) {
  const [result, setResult] = useState<FoodBalanceScoreResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/v1/food-balance-score?contactId=${contactId}`)
      .then((res) => {
        if (res.status === 404) return null; // feature flag off — render nothing
        if (!res.ok) throw new Error("failed");
        return res.json();
      })
      .then((data: FoodBalanceScoreResult | null) => {
        if (cancelled) return;
        setResult(data);
        if (data) {
          trackFoodBalanceEvent(
            data.status === "collecting_data" || data.status === "refreshing_data"
              ? "food_balance_collecting_state_viewed"
              : "food_balance_score_viewed",
            { status: data.status }
          );
        }
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (loading) return null;
  if (error) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <p className="text-sm text-gray-500">
          Your Food Balance Score is temporarily unavailable. Your meal history is safe. Please try again shortly.
        </p>
      </div>
    );
  }
  if (!result) return null;

  if (result.status === "collecting_data" || result.status === "refreshing_data") {
    const { eligibleMealCount, requiredMealCount, distinctLoggingDays, requiredLoggingDays } = result.dataCoverage;
    const progressPct = Math.min(100, Math.round((eligibleMealCount / requiredMealCount) * 100));
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <h3 className="text-base font-bold text-gray-900">Food Balance Score</h3>
        <p className="text-sm font-semibold text-[#6750A4] mt-1">
          {result.status === "refreshing_data" ? "Refreshing your Food Balance Score" : "Learning your eating pattern"}
        </p>
        <p className="text-sm text-gray-500 mt-1">
          {result.status === "refreshing_data"
            ? "Log a few more recent meals so the score reflects your current eating pattern."
            : "Log a few more meals so Tistra can understand your nutrition and give you useful guidance."}
        </p>
        <div className="mt-3 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-[#6750A4] rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {eligibleMealCount} of {requiredMealCount} meals logged · Logged across {distinctLoggingDays} of {requiredLoggingDays} days
        </p>
      </div>
    );
  }

  const score = result.score ?? 0;
  const label = bandLabelFor(score);
  const confidenceBand = result.confidence >= 0.75 ? "high" : result.confidence >= 0.45 ? "moderate" : "still_learning";

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-gray-900">Food Balance Score</h3>
        <span className="text-xs font-medium text-gray-400">{confidenceLabel(confidenceBand)}</span>
      </div>
      <div className="flex items-center gap-4 mt-2">
        <ScoreRing score={score} />
        <div>
          <p
            className="text-sm font-semibold text-gray-900"
            aria-label={`Food Balance Score: ${score} out of 100. ${label}. Based on meals logged over the last 14 days.`}
          >
            {label}
          </p>
          {result.status === "partially_personalized" && (
            <p className="text-xs text-gray-500 mt-1">
              Add your height, weight, and activity level to personalize this score for your goal.
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">Based on your meals from the last 14 days</p>
        </div>
      </div>

      {result.recommendations.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Top ways to improve</p>
          <ol className="space-y-1.5">
            {result.recommendations.map((rec, i) => (
              <li key={rec.id} className="text-sm text-gray-700">
                {i + 1}. {rec.title}
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-3">
        This is not a medical assessment and may not capture everything you eat.
      </p>
    </div>
  );
}
