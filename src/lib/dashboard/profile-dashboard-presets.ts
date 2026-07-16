// Per-role theme/copy presets for ProfileDashboard, matching each product's
// existing visual identity exactly (adults/family = CSS-var theming, gym =
// hardcoded purple/gray Tailwind, unchanged from ContactDashboard.tsx/
// ClientDashboard.tsx before this merge) plus the role-flavored copy
// requested for participant ("my health dashboard") vs family/coach
// ("I am supporting this person").

import type { ProfileDashboardTheme, ProfileDashboardCopy } from "@/components/dashboard/ProfileDashboard";

export const FAMILY_ADMIN_THEME: ProfileDashboardTheme = {
  headerBgClassName: "bg-[var(--color-dashboard-primary)]",
  headerTextClassName: "text-white",
  headerSubTextClassName: "text-white/70",
  headerButtonClassName: "text-sm font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors",
  avatarBgClassName: "bg-white/20",
  avatarTextClassName: "text-white",
  goalBadgeClassName: "text-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)]",
  proteinTextClassName: "text-[var(--color-dashboard-primary)]",
  pageBgClassName: "bg-[var(--color-dashboard-surface)]",
  containerMaxWidthClassName: "max-w-4xl",
};

export const COACH_THEME: ProfileDashboardTheme = {
  headerBgClassName: "bg-white border-b border-gray-100",
  headerTextClassName: "text-gray-900",
  headerSubTextClassName: "text-gray-400",
  headerButtonClassName: "text-sm font-medium text-gray-500 hover:text-gray-800 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-1.5 transition-colors",
  avatarBgClassName: "bg-purple-100",
  avatarTextClassName: "text-purple-700",
  goalBadgeClassName: "text-purple-700 bg-purple-50",
  proteinTextClassName: "text-purple-700",
  pageBgClassName: "bg-gray-50",
  containerMaxWidthClassName: "max-w-5xl",
};

// Participant reuses the family/adults visual identity — it's the same
// product's self-view, just a different viewer role.
export const PARTICIPANT_THEME: ProfileDashboardTheme = FAMILY_ADMIN_THEME;

export const FAMILY_ADMIN_COPY: ProfileDashboardCopy = {
  greeting: (name) => `Supporting ${name} 💜`,
  editLabel: "Edit",
  noMealsMessage: "No meals shared yet — they just need to send a WhatsApp photo!",
  inviteTitle: () => "Ask them to start Tistra on WhatsApp",
  inviteDescription: (name) => `Send ${name} this link — they message the bot, and you'll see them connected here right away.`,
};

export const COACH_COPY: ProfileDashboardCopy = {
  greeting: (name) => `Supporting ${name} 💪`,
  editLabel: "Edit",
  noMealsMessage: "No meals shared yet — they just need to send a WhatsApp photo!",
  inviteTitle: () => "Invite client on WhatsApp",
  inviteDescription: (name) => `Send ${name} this link — once they message the bot, they'll show up connected here.`,
};

// "Participant view should feel like 'my health dashboard'" — first person,
// no "supporting"/"invite" framing.
export const PARTICIPANT_COPY: ProfileDashboardCopy = {
  greeting: (name) => `Hi, ${name} 👋`,
  editLabel: "Edit my info",
  noMealsMessage: "No meals logged yet — send a photo on WhatsApp to get started!",
  inviteTitle: () => "",
  inviteDescription: () => "",
};
