"use client";

import type { ReactNode } from "react";
import { FamilyAvatarStack } from "./FamilyAvatarStack";

interface StatDef {
  key: string;
  value: number;
  label: string;
  icon: ReactNode;
}

/** One compact rounded strip below the greeting: overlapping avatars +
 * "+" add action on the left, then Active/Focus/Reminder counts with thin
 * dividers — replaces the old dashboard's two giant "People added"/
 * "Sending meals" StatCards (see the family-dashboard-redesign spec). */
export function FamilySummaryStrip({
  people,
  onAdd,
  activeCount,
  focusCount,
  reminderCount,
}: {
  people: Array<{ id: string; fullName: string; photoUrl?: string }>;
  onAdd?: () => void;
  activeCount: number;
  focusCount: number;
  reminderCount: number;
}) {
  const stats: StatDef[] = [
    { key: "active", value: activeCount, label: "Active", icon: <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" aria-hidden="true" /> },
    { key: "focus", value: focusCount, label: "Focus", icon: <span aria-hidden="true">◎</span> },
    { key: "reminder", value: reminderCount, label: "Reminder", icon: <span aria-hidden="true">🔔</span> },
  ];

  return (
    <div className="flex items-center gap-3 sm:gap-7 rounded-2xl border border-gray-100 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] px-3 sm:px-5 py-3.5 sm:py-4 mb-4">
      <FamilyAvatarStack people={people} onAdd={onAdd} />
      <div className="flex items-center gap-2.5 sm:gap-7 shrink-0">
        {stats.map((stat, i) => (
          <div key={stat.key} className={`flex items-center gap-1.5 sm:gap-2 ${i > 0 ? "pl-2.5 sm:pl-7 border-l border-gray-100 dark:border-white/10" : ""}`}>
            <span className="text-[var(--color-dashboard-primary)] text-sm sm:text-base leading-none">{stat.icon}</span>
            <div>
              <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white leading-none">{stat.value}</p>
              <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 whitespace-nowrap">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
