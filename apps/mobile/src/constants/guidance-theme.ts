// Guidance mode's palette: charcoal and lavender, always dark whatever the
// system theme, because the change of palette is how the screen says you are
// in a different mode. Mirrors the .guidance-theme tokens (--gm-*) in the
// web app's src/app/globals.css; keep the two in step.
//
// Lavender is used sparingly, one accent per card. "Over" is a soft amber,
// never red. The next-meal card is the one light surface ("hero"), and every
// text colour on it clears 4.5:1.

export const GM = {
  page: '#131217',
  card: '#1B1A21',
  raised: '#23222A',
  track: '#2D2B36',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',
  text: '#ECEAF2',
  textSecondary: '#ABA7BA',
  textMuted: '#8E8A9E',
  accent: '#B7A4FF',
  accentHover: '#C9BAFF',
  accentText: '#C9BAFF',
  accentSoft: 'rgba(183, 164, 255, 0.12)',
  accentBorder: 'rgba(183, 164, 255, 0.35)',
  onAccent: '#1C1530',
  over: '#F5B544',
  overText: '#F5C46B',
  overSoft: 'rgba(245, 181, 68, 0.08)',
  overBorder: 'rgba(245, 181, 68, 0.35)',
  errorText: '#FCA5A5',
  hero: '#DDD4FB',
  heroText: '#1C1530',
  heroTextSecondary: '#4A4166',
  heroTextMuted: '#5F5880',
  heroAccent: '#5634C0',
  heroButton: '#5B3CC4',
  heroBorder: 'rgba(28, 21, 48, 0.12)',
  /** Errors on the light hero card, where the dark theme's pink is unreadable. */
  heroError: '#8A1C1C',
} as const;

/** The smallest tap target, in points (Apple HIG and Material both ask 44–48). */
export const GM_TAP = 44;
