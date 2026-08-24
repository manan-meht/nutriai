/** Pure arithmetic for the admin metrics feed, split out so the edge cases
 * can be tested directly rather than grepped for in a route file. */

/**
 * Change against the preceding window of equal length, as whole percent.
 *
 * Returns null when the previous window was empty. Every honest rendering of
 * "up from zero" is either infinity or an arbitrary 100%, and on a dashboard
 * both read as real growth — so the caller is made to handle the case rather
 * than being handed a number that lies.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}
