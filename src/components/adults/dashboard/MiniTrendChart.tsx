"use client";

/** Small purple sparkline of a person's daily logged calories over the
 * rolling last 7 days (see AdultsContact.last7DaysCalories, computed by
 * computeDailyCalories) — chosen over a Food Balance Score trend since
 * there's no stored history of daily scores anywhere in the app (only the
 * latest computed score, via /food-balance-score), while calories are
 * derivable straight from meal_logs. Falls back to a "coming soon" empty
 * state when every day in the window is 0 (no meals logged at all yet),
 * rather than plotting a meaningless flat line at zero. */
export function MiniTrendChart({ scores }: { scores?: number[] }) {
  if (!scores || scores.length < 2 || scores.every((s) => s === 0)) {
    return (
      <div className="flex flex-col items-center justify-center h-20 text-center">
        <svg width="28" height="20" viewBox="0 0 28 20" aria-hidden="true" className="text-gray-300 dark:text-gray-600 mb-1">
          <polyline points="1,15 8,9 14,12 20,4 27,7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-tight max-w-[80px]">Trend available soon</p>
      </div>
    );
  }

  const width = 100;
  const height = 44;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const points = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * width;
    const y = height - ((s - min) / range) * (height - 8) - 4;
    return [x, y] as const;
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <div className="flex flex-col items-center">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="7-day calorie trend" className="overflow-visible">
        <defs>
          <linearGradient id="trend-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-dashboard-primary)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-dashboard-primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#trend-fade)" />
        <path d={linePath} fill="none" stroke="var(--color-dashboard-primary)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 2.25 : 1.5} fill="var(--color-dashboard-primary)" />
        ))}
      </svg>
    </div>
  );
}
