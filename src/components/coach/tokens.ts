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
