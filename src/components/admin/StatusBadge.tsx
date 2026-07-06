export type BadgeMood = "good" | "steady" | "support";

const MOOD_CLASSES: Record<BadgeMood, string> = {
  good: "bg-[var(--color-status-good-bg)] text-[var(--color-status-good-text)]",
  steady: "bg-[var(--color-status-steady-bg)] text-[var(--color-status-steady-text)]",
  support: "bg-[var(--color-status-support-bg)] text-[var(--color-status-support-text)]",
};

export function StatusBadge({ label, mood }: { label: string; mood: BadgeMood }) {
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${MOOD_CLASSES[mood]}`}>{label}</span>;
}

export function priorityMood(priority: "high" | "medium" | "low"): BadgeMood {
  return priority === "high" ? "support" : priority === "medium" ? "steady" : "good";
}

export function reviewStatusMood(status: string): BadgeMood {
  if (status === "correct" || status === "reviewed") return "good";
  if (status === "incorrect" || status === "escalated") return "support";
  return "steady";
}
