import * as SecureStore from 'expo-secure-store';
import * as StoreReview from 'expo-store-review';

import { shouldAskForReview } from './review-policy';

// Asking for an App Store rating, once, at a moment the person is likely to
// feel good about the app.
//
// Why this exists: the app shipped with zero ratings, which costs twice
// over. Store search ranks heavily on ratings volume, and an unrated
// listing converts badly even when someone does find it.
//
// The decision itself lives in review-policy.ts, dependency-free so the
// root jest config can test it — this file is only the native edge.

const ASKED_AT_KEY = 'tistra_review_asked_at';

/**
 * Asks for a rating if this is a good moment, and records that we asked.
 *
 * Deliberately silent about everything. A rating prompt is the lowest-stakes
 * thing in the app — no failure here is worth a message to the user, and a
 * thrown error must never reach a screen that was rendering fine.
 *
 * The "asked" timestamp is written whether or not the OS actually shows the
 * dialog, because it never tells us. Treating a suppressed prompt as "not
 * asked" would make this retry on every load, spending Apple's three-per-
 * year allowance on someone who has already seen it.
 */
export async function maybeAskForReview(totalMeals: number): Promise<void> {
  try {
    if (!(await StoreReview.hasAction())) return;

    const raw = await SecureStore.getItemAsync(ASKED_AT_KEY);
    const parsed = raw ? Number(raw) : null;
    const lastAskedAt = parsed !== null && Number.isFinite(parsed) ? parsed : null;

    if (!shouldAskForReview({ totalMeals, lastAskedAt, now: Date.now() })) return;

    // Recorded BEFORE the request, not after. If requestReview throws
    // partway, the user may still have seen the dialog — asking again on
    // the next load would be worse than missing one ask.
    await SecureStore.setItemAsync(ASKED_AT_KEY, String(Date.now()));
    await StoreReview.requestReview();
  } catch (err) {
    console.warn('[review-prompt] skipped:', err);
  }
}
