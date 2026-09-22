// Who has ever sent Tistra a meal photo, and how many.
//
// Kept separate from the action that loads the rows so the counting is
// testable without a database, matching model-quality.ts.
//
// "Active days" is counted in each person's OWN timezone, not UTC. A meal
// photographed at 1am in Singapore is 5pm the previous day in UTC, so a UTC
// day count both splits single days in two and merges distinct ones — and
// the contacts this counts are spread across Asia, Europe and the US.

export interface MealRowForSubmitters {
  /** adults_contacts.id or gym_clients.id — whoever the meal belongs to. */
  personId: string;
  loggedAt: string;
  hasPhoto: boolean;
  /** IANA zone; falls back to India, matching the column default. */
  timezone?: string | null;
}

export interface PhotoSubmitter {
  personId: string;
  /** The headline number: meals with a photo attached. */
  photoCount: number;
  /** Every meal, including ones logged by text alone — the gap between
   * this and photoCount says how much of a person's logging is photos. */
  mealCount: number;
  firstPhotoAt: string;
  lastPhotoAt: string;
  /** Distinct calendar days, in the person's own timezone, on which they
   * sent at least one photo. Separates "30 photos over 30 days" from
   * "30 photos in one afternoon". */
  activeDays: number;
}

export interface PhotoSubmitterTotals {
  submitters: PhotoSubmitter[];
  totalPhotos: number;
  totalSubmitters: number;
  /** Median rather than mean: a single heavy user distorts the mean badly
   * at this scale, and the median is what "a typical submitter" means. */
  medianPhotos: number;
}

function localDay(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    // An unrecognised zone must not lose the row — fall back to the UTC day.
    return iso.slice(0, 10);
  }
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/** Aggregates raw meal rows into one entry per person who has sent at least
 * one photo. People who have only ever logged by text are left out entirely
 * — they are not photo submitters — but their text meals still count toward
 * mealCount for anyone who has also sent a photo. */
export function summarisePhotoSubmitters(rows: MealRowForSubmitters[]): PhotoSubmitterTotals {
  const byPerson = new Map<
    string,
    { photoCount: number; mealCount: number; first: string; last: string; days: Set<string> }
  >();

  for (const row of rows) {
    if (!row.personId || !row.loggedAt) continue;
    let entry = byPerson.get(row.personId);
    if (!entry) {
      entry = { photoCount: 0, mealCount: 0, first: "", last: "", days: new Set() };
      byPerson.set(row.personId, entry);
    }
    entry.mealCount += 1;
    if (!row.hasPhoto) continue;

    entry.photoCount += 1;
    entry.days.add(localDay(row.loggedAt, row.timezone || "Asia/Kolkata"));
    if (!entry.first || row.loggedAt < entry.first) entry.first = row.loggedAt;
    if (!entry.last || row.loggedAt > entry.last) entry.last = row.loggedAt;
  }

  const submitters: PhotoSubmitter[] = [];
  for (const [personId, entry] of byPerson) {
    if (entry.photoCount === 0) continue;
    submitters.push({
      personId,
      photoCount: entry.photoCount,
      mealCount: entry.mealCount,
      firstPhotoAt: entry.first,
      lastPhotoAt: entry.last,
      activeDays: entry.days.size,
    });
  }

  // Most photos first; the most recently active breaks a tie, so a live
  // account outranks a dormant one on the same count.
  submitters.sort((a, b) => b.photoCount - a.photoCount || b.lastPhotoAt.localeCompare(a.lastPhotoAt));

  return {
    submitters,
    totalPhotos: submitters.reduce((sum, s) => sum + s.photoCount, 0),
    totalSubmitters: submitters.length,
    medianPhotos: median(submitters.map((s) => s.photoCount)),
  };
}
