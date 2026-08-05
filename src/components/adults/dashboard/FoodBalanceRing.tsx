"use client";

/** Compact circular Food Balance Score ring for the family dashboard's
 * per-card health snapshot — a smaller sibling of FoodBalanceScoreCard's
 * own ScoreRing (kept separate rather than shared/parameterized since that
 * one renders a full 270° gauge with its own skeleton/loading states tuned
 * for a standalone card, while this one is one of three compact columns
 * inside FamilyHealthCard). Plain SVG, no charting dependency. */
export function FoodBalanceRing({ score, label }: { score: number; label: string }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.max(0, Math.min(100, score)) / 100 * circumference;

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative w-20 h-20">
        <svg width="80" height="80" viewBox="0 0 80 80" role="img" aria-label={`Food Balance Score: ${score} out of 100, ${label}`}>
          <circle cx="40" cy="40" r={radius} fill="none" stroke="var(--color-fbs-ring-track)" strokeWidth="7" />
          <circle
            cx="40"
            cy="40"
            r={radius}
            fill="none"
            stroke="var(--color-dashboard-primary)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            transform="rotate(-90 40 40)"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-gray-900 dark:text-white">{score}</span>
        </div>
      </div>
      <p className="text-xs font-medium text-[var(--color-dashboard-primary)] mt-1.5 leading-tight max-w-[90px]">{label}</p>
    </div>
  );
}
