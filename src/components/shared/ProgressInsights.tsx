"use client";

import type { TrendInsights } from "@/lib/insights";

interface Props {
  insights: TrendInsights;
  variant?: "gym" | "adults";
  /** Opts into dark: classes — only ProfileDashboard's family_admin/
   * participant callers set this (see ProfileDashboardTheme.
   * enableDarkMode); the gym/coach caller doesn't. */
  dm?: boolean;
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

// Translucent dark counterparts for the pastel mood backgrounds above,
// keyed by the same border color word so DARK_MOOD_STYLES[style.bg] finds
// the right one regardless of mood/variant — see ProgressInsights' dm prop.
const DARK_MOOD_STYLES: Record<string, { bg: string; title: string; bullet: string }> = {
  "bg-green-50 border-green-100": { bg: "dark:bg-green-500/10 dark:border-green-500/20", title: "dark:text-green-300", bullet: "dark:text-green-300/90" },
  "bg-blue-50 border-blue-100": { bg: "dark:bg-blue-500/10 dark:border-blue-500/20", title: "dark:text-blue-300", bullet: "dark:text-blue-300/90" },
  "bg-rose-50 border-rose-100": { bg: "dark:bg-rose-500/10 dark:border-rose-500/20", title: "dark:text-rose-300", bullet: "dark:text-rose-300/90" },
  "bg-amber-50 border-amber-100": { bg: "dark:bg-amber-500/10 dark:border-amber-500/20", title: "dark:text-amber-300", bullet: "dark:text-amber-300/90" },
};

export function ProgressInsights({ insights, variant = "gym", dm }: Props) {
  const style = MOOD_STYLES[insights.mood][variant];
  const darkStyle = dm ? DARK_MOOD_STYLES[style.bg] : undefined;

  return (
    <div className={`rounded-2xl border p-4 ${style.bg} ${darkStyle?.bg ?? ""}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5 flex-shrink-0">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-base mb-2 ${style.titleColor} ${darkStyle?.title ?? ""}`}>{insights.headline}</p>
          <ul className="space-y-1.5">
            {insights.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                <span className={`text-sm leading-relaxed ${style.bulletColor} ${darkStyle?.bullet ?? ""}`}>{b}</span>
              </li>
            ))}
          </ul>
          {/* Quick stats strip */}
          <div className={`flex gap-4 mt-3 pt-3 border-t border-black/5 flex-wrap ${dm ? "dark:border-white/10" : ""}`}>
            <QuickStat
              label="Protein/day"
              thisWeek={`${insights.avgProteinThisWeek}g`}
              lastWeek={insights.avgProteinLastWeek > 0 ? `${insights.avgProteinLastWeek}g` : null}
              change={insights.proteinChangePct}
              textColor={`${style.bulletColor} ${darkStyle?.bullet ?? ""}`}
            />
            <QuickStat
              label="Calories/day"
              thisWeek={insights.avgCalThisWeek > 0 ? `${insights.avgCalThisWeek}` : "—"}
              lastWeek={insights.avgCalLastWeek > 0 ? `${insights.avgCalLastWeek}` : null}
              change={insights.calChangeAbs !== null ? Math.round((insights.calChangeAbs / (insights.avgCalLastWeek || 1)) * 100) : null}
              textColor={`${style.bulletColor} ${darkStyle?.bullet ?? ""}`}
            />
            <QuickStat
              label="Days logged"
              thisWeek={`${insights.daysLoggedThisWeek}/7`}
              lastWeek={insights.daysLoggedLastWeek > 0 ? `${insights.daysLoggedLastWeek}/7` : null}
              change={insights.daysLoggedLastWeek > 0 ? insights.daysLoggedThisWeek - insights.daysLoggedLastWeek : null}
              isAbsolute
              textColor={`${style.bulletColor} ${darkStyle?.bullet ?? ""}`}
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
