"use client";

import Image from "next/image";

/** Rounded thumbnail of a person's most recently logged meal, plus a
 * "Today · N meals" / "Yesterday · N meals" caption — the dashboard's one
 * deliberate reminder that Tistra is built around photographing meals (see
 * the family-dashboard-redesign spec this was built against). Falls back
 * to a plain food glyph placeholder (never a broken image) when the latest
 * meal has no photo, rather than dropping the column. */
export function LatestMealPreview({ photoUrl, lastMealAt, mealCount }: { photoUrl?: string; lastMealAt?: string; mealCount: number }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-20 h-20 rounded-2xl overflow-hidden bg-[var(--color-dashboard-primary-light)] dark:bg-white/5 flex items-center justify-center relative shrink-0">
        {photoUrl ? (
          <Image src={photoUrl} alt="" fill sizes="80px" className="object-cover" />
        ) : (
          <span className="text-2xl" aria-hidden="true">🍽️</span>
        )}
      </div>
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1.5 leading-tight">
        {mealCount > 0 ? (
          <>
            {formatMealDay(lastMealAt)} · {mealCount} meal{mealCount !== 1 ? "s" : ""}
          </>
        ) : (
          "No meals yet"
        )}
      </p>
    </div>
  );
}

function formatMealDay(lastMealAt?: string): string {
  if (!lastMealAt) return "—";
  const date = new Date(lastMealAt);
  const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}
