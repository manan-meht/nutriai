"use client";

import type { TrendInsights } from "@/lib/insights";

interface Props {
  insights: TrendInsights;
  variant?: "gym" | "adults";
}

const MOOD_STYLES = {
  positive: {
    gym:    { bg: "bg-green-50 border-green-100",   icon: "📈", titleColor: "text-green-900", bulletColor: "text-green-800", dot: "bg-green-400" },
    adults: { bg: "bg-green-50 border-green-100",   icon: "🌟", titleColor: "text-green-900", bulletColor: "text-green-800", dot: "bg-green-400" },
  },
  neutral: {
    gym:    { bg: "bg-blue-50 border-blue-100",     icon: "📊", titleColor: "text-blue-900",  bulletColor: "text-blue-800",  dot: "bg-blue-400" },
    adults: { bg: "bg-rose-50 border-rose-100",     icon: "😊", titleColor: "text-rose-900",  bulletColor: "text-rose-800",  dot: "bg-rose-400" },
  },
  attention: {
    gym:    { bg: "bg-amber-50 border-amber-100",   icon: "⚠️", titleColor: "text-amber-900", bulletColor: "text-amber-800", dot: "bg-amber-400" },
    adults: { bg: "bg-amber-50 border-amber-100",   icon: "💛", titleColor: "text-amber-900", bulletColor: "text-amber-800", dot: "bg-amber-400" },
  },
};

export function ProgressInsights({ insights, variant = "gym" }: Props) {
  const style = MOOD_STYLES[insights.mood][variant];

  return (
    <div className={`rounded-2xl border p-4 ${style.bg}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5 flex-shrink-0">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-base mb-2 ${style.titleColor}`}>{insights.headline}</p>
          <ul className="space-y-1.5">
            {insights.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                <span className={`text-sm leading-relaxed ${style.bulletColor}`}>{b}</span>
              </li>
            ))}
          </ul>
          {/* Quick stats strip */}
          <div className="flex gap-4 mt-3 pt-3 border-t border-black/5 flex-wrap">
            <QuickStat
              label="Protein/day"
              thisWeek={`${insights.avgProteinThisWeek}g`}
              lastWeek={insights.avgProteinLastWeek > 0 ? `${insights.avgProteinLastWeek}g` : null}
              change={insights.proteinChangePct}
              textColor={style.bulletColor}
            />
            <QuickStat
              label="Calories/day"
              thisWeek={insights.avgCalThisWeek > 0 ? `${insights.avgCalThisWeek}` : "—"}
              lastWeek={insights.avgCalLastWeek > 0 ? `${insights.avgCalLastWeek}` : null}
              change={insights.calChangeAbs !== null ? Math.round((insights.calChangeAbs / (insights.avgCalLastWeek || 1)) * 100) : null}
              textColor={style.bulletColor}
            />
            <QuickStat
              label="Days logged"
              thisWeek={`${insights.daysLoggedThisWeek}/7`}
              lastWeek={insights.daysLoggedLastWeek > 0 ? `${insights.daysLoggedLastWeek}/7` : null}
              change={insights.daysLoggedLastWeek > 0 ? insights.daysLoggedThisWeek - insights.daysLoggedLastWeek : null}
              isAbsolute
              textColor={style.bulletColor}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickStat({
  label, thisWeek, lastWeek, change, isAbsolute = false, textColor,
}: {
  label: string; thisWeek: string; lastWeek: string | null;
  change: number | null; isAbsolute?: boolean; textColor: string;
}) {
  const showChange = change !== null && change !== 0;
  const positive = (change ?? 0) > 0;

  return (
    <div>
      <p className={`text-xs opacity-60 mb-0.5 ${textColor}`}>{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className={`text-sm font-bold ${textColor}`}>{thisWeek}</span>
        {lastWeek && (
          <span className={`text-xs opacity-50 ${textColor}`}>vs {lastWeek}</span>
        )}
        {showChange && (
          <span className={`text-xs font-semibold ${positive ? "text-green-600" : "text-red-500"}`}>
            {positive ? "+" : ""}{isAbsolute ? change : `${change}%`}
          </span>
        )}
      </div>
    </div>
  );
}
