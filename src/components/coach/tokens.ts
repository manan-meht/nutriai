// Design tokens for the Tistra Coach product surfaces, from the Stitch
// "Tistra Editorial Marketplace" system.
//
// Kept as a scoped constant rather than added to globals.css because
// Tistra Health's own dashboards use a different palette
// (--color-dashboard-*) and the two products must not bleed into each
// other. Shared here so the shell, dashboard, calendar, clients and
// payments screens can't drift apart.

export const CLUB_TOKENS = {
  surface: "#FBF8FF",
  surfaceContainerLowest: "#FFFFFF",
  surfaceContainerLow: "#F4F2FD",
  surfaceContainer: "#EEEDF7",
  onSurface: "#1A1B22",
  onSurfaceVariant: "#4A4455",
  outline: "#7B7487",
  outlineVariant: "#CCC3D8",
  primary: "#630ED4",
  primaryHover: "#4F0BAA",
  primaryContainer: "#EDE0FF",
  onPrimary: "#FFFFFF",
  success: "#2E6B4F",
  successContainer: "#DFF3E8",
  warning: "#8A5A00",
  warningContainer: "#FFF0D4",
  error: "#BA1A1A",
  errorContainer: "#FFDAD6",
  onErrorContainer: "#410002",
} as const;

// Dark counterpart for the swipe/browse surface, from the Stitch "Tistra
// Obsidian" system (DESIGN.md in the discovery-redesign export). Scoped the
// same way as CLUB_TOKENS: the light marketplace and the dark deck must not
// bleed into each other, and neither uses globals.
export const OBSIDIAN_TOKENS = {
  surface: "#0B1326",
  surfaceContainerLow: "#131B2E",
  surfaceContainer: "#171F33",
  onSurface: "#DAE2FD",
  onSurfaceVariant: "#CCC3D8",
  primary: "#D2BBFF",
  primaryContainer: "#7C3AED",
  onPrimaryContainer: "#EDE0FF",
  star: "#FACC15",
  /** The cover/base gradient behind everything. */
  backdrop: "radial-gradient(circle at top left, #3B0764, #1E1B4B, #0B1326)",
} as const;
