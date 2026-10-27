import Link from "next/link";

import type { GuidanceMode } from "@/lib/guidance/activation";

// The way in to the Guidance screen from a dashboard. Rendered only when
// lib/guidance/view.ts's isGuidanceEntryVisible says so; carries nothing
// but the mode, so it is safe on any page that may show the contact at all.
//
// `personName` is set when the viewer is not the tracked person (a
// caregiver or coach looking at someone they track), and words the card for
// setting it up on their behalf.

interface GuidanceEntryCardProps {
  href: string;
  mode: GuidanceMode;
  personName?: string;
  /** Opts into dark: classes, as AccessCodeCard's prop of the same name. */
  dm?: boolean;
}

export function GuidanceEntryCard({ href, mode, personName, dm }: GuidanceEntryCardProps) {
  const on = mode === "guidance";
  const title = on ? "Nutrition Guidance is on" : "Nutrition Guidance";
  const body = personName
    ? on
      ? `See ${personName}'s targets for today and what they've eaten so far.`
      : `Set up daily calorie and protein targets for ${personName} from a few questions.`
    : on
      ? "See today's targets and what you've eaten so far."
      : "Get daily calorie and protein targets from a few questions.";
  const cta = on ? "View" : "Set up";

  return (
    <Link
      href={href}
      className={`flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 hover:bg-gray-50 transition ${
        dm ? "dark:border-white/10 dark:bg-[var(--color-dashboard-dark-card)] dark:hover:bg-white/5" : ""
      }`}
    >
      <span>
        <span className={`block text-sm font-semibold text-gray-900 ${dm ? "dark:text-white" : ""}`}>{title}</span>
        <span className={`block text-sm text-gray-500 mt-0.5 ${dm ? "dark:text-gray-400" : ""}`}>{body}</span>
      </span>
      <span className="shrink-0 text-sm font-medium text-[var(--color-dashboard-primary)]">{cta} →</span>
    </Link>
  );
}
