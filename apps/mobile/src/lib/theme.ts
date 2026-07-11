// Mirrors the web app's design tokens (src/app/globals.css's
// --color-dashboard-* variables and the status-badge palette used across
// ContactCard/ClientCard/StatCard) so the mobile app reads as the same
// product, not a generic React Native app.
export const colors = {
  primary: "#6750A4",
  primaryHover: "#4F378A",
  primaryLight: "#F3EEFB",
  surface: "#FAF8FC",
  white: "#FFFFFF",
  border: "#F3F4F6",
  textPrimary: "#111827",
  textSecondary: "#6B7280",
  textMeta: "#9CA3AF",

  // Status semantics — soft, non-alarming (red never means "failure", just
  // "needs support"), matching StatusBadge's mood palette on web.
  good: { bg: "#E6F4EA", text: "#256B3A", dot: "#6FCF97" },
  steady: { bg: "#FEF6E0", text: "#8A6D1D", dot: "#F2C94C" },
  support: { bg: "#FBEAEA", text: "#9B4A44", dot: "#E8A19C" },

  activityBg: "#F0FDF4", // green-50, meal-logged banner
  activityText: "#15803D", // green-700
  activityDot: "#4ADE80", // green-400
  pendingBg: "#FFFBEB", // amber-50
  pendingText: "#B45309", // amber-700
  pendingDot: "#FBBF24", // amber-400

  error: "#DC2626",
} as const;

export const radii = {
  card: 16, // rounded-2xl
  pill: 12, // rounded-xl
  full: 999, // rounded-full
} as const;

export const MEAL_EMOJI: Record<string, string> = {
  breakfast: "🌅",
  lunch: "☀️",
  dinner: "🌙",
  snack: "🍎",
};

export function mealEmoji(mealType: string): string {
  return MEAL_EMOJI[mealType.toLowerCase()] ?? "🍽️";
}
