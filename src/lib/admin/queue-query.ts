/** Filter/sort/pagination state carried in the review queue's querystring. */
export interface QueueSearchParams {
  tab?: string;
  id?: string;
  q?: string;
  status?: string;
  priority?: string;
  mealType?: string;
  source?: string;
  market?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: string;
  page?: string;
}

/**
 * Serialises the queue's filter/sort/page state back into a querystring so
 * it survives navigating into a meal and back.
 *
 * The queue's filters live entirely in the URL, but every link out of it
 * used to be a bare `/admin?id=<id>` — so opening a meal, or saving a
 * review, dropped the whole querystring and dumped the reviewer back on the
 * default "pending / newest / page 1" view. The filters were only sticky
 * for as long as you never clicked anything.
 *
 * `id` is dropped because it selects the detail view rather than filtering,
 * and `tab` because the queue is the default tab; carrying either into a
 * "back to queue" link would send you straight back to where you came from.
 * `overrides` sets a key, or removes it when the value is undefined.
 */
export function queueQueryString(
  sp: QueueSearchParams,
  overrides: Partial<Record<string, string | undefined>> = {}
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (key === "id" || key === "tab") continue;
    if (key in overrides) continue;
    if (value) params.set(key, value);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value) params.set(key, value);
  }
  return params.toString();
}
