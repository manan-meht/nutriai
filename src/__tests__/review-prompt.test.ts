import fs from "fs";
import path from "path";
import { shouldAskForReview } from "../../apps/mobile/src/lib/review-policy";

// Tistra Health shipped with zero ratings, which costs twice: store search
// ranks heavily on ratings volume, and an unrated listing converts badly
// even when someone does find it.
//
// The gating is strict because Apple enforces three prompts per user per
// 365 days at the OS level, silently. A prompt fired at a bad moment does
// not merely go ignored — it spends one of three chances for the year.

const MOBILE = path.join(__dirname, "..", "..", "apps", "mobile");
const src = (p: string) => fs.readFileSync(path.join(MOBILE, p), "utf-8");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-23T00:00:00Z");

describe("when to ask for a rating", () => {
  it("does not ask someone who has barely used it", () => {
    // Below this the honest answer to "how are you finding it?" is "I don't
    // know yet", and that is not a rating worth collecting.
    expect(shouldAskForReview({ totalMeals: 0, lastAskedAt: null, now: NOW })).toBe(false);
    expect(shouldAskForReview({ totalMeals: 14, lastAskedAt: null, now: NOW })).toBe(false);
  });

  it("asks once real use has happened", () => {
    expect(shouldAskForReview({ totalMeals: 15, lastAskedAt: null, now: NOW })).toBe(true);
    expect(shouldAskForReview({ totalMeals: 200, lastAskedAt: null, now: NOW })).toBe(true);
  });

  it("does not ask again straight away", () => {
    expect(shouldAskForReview({ totalMeals: 200, lastAskedAt: NOW - DAY, now: NOW })).toBe(false);
    expect(shouldAskForReview({ totalMeals: 200, lastAskedAt: NOW - 90 * DAY, now: NOW })).toBe(false);
  });

  it("may ask again much later", () => {
    expect(shouldAskForReview({ totalMeals: 200, lastAskedAt: NOW - 180 * DAY, now: NOW })).toBe(true);
  });

  it("keeps our own window inside Apple's 365 days", () => {
    // Ours must bind first, so the behaviour stays ours to reason about
    // rather than being silently overridden by the OS.
    const justInside = shouldAskForReview({ totalMeals: 200, lastAskedAt: NOW - 364 * DAY, now: NOW });
    expect(justInside).toBe(true);
  });
});

describe("how it is wired up", () => {
  it("records that it asked before asking, not after", () => {
    // If requestReview throws partway the user may still have seen the
    // dialog; asking again next load would be worse than missing one ask.
    const t = src("src/lib/review-prompt.ts");
    const setIdx = t.indexOf("SecureStore.setItemAsync(ASKED_AT_KEY");
    const askIdx = t.indexOf("StoreReview.requestReview()");
    expect(setIdx).toBeGreaterThan(-1);
    expect(askIdx).toBeGreaterThan(setIdx);
  });

  it("never surfaces a failure to the user", () => {
    // A rating prompt is the lowest-stakes thing in the app; nothing here
    // is worth interrupting a screen that was rendering fine.
    const t = src("src/lib/review-prompt.ts");
    expect(t).toMatch(/catch \(err\)/);
    expect(t).not.toMatch(/Alert\.alert/);
  });

  it("checks the device can actually show a prompt first", () => {
    expect(src("src/lib/review-prompt.ts")).toMatch(/StoreReview\.hasAction\(\)/);
  });

  it("asks from the family list, not from a paywall or an error screen", () => {
    // The moment matters: the person is looking at meals their family
    // logged, which is the app working.
    const list = src("src/app/(app)/adults/index.tsx");
    expect(list).toMatch(/maybeAskForReview\(totalMealsLogged\)/);
    expect(src("src/app/(app)/adults/paywall.tsx")).not.toMatch(/maybeAskForReview/);
    expect(src("src/components/screen-states.tsx")).not.toMatch(/maybeAskForReview/);
  });

  it("counts meals only from a loaded list", () => {
    // A zero from the loading state must not be read as "no use yet" and
    // it must never ask while the screen is still resolving.
    const list = src("src/app/(app)/adults/index.tsx");
    expect(list).toMatch(/state\.status === 'ready'\s*\?\s*state\.contacts\.reduce/);
    expect(list).toMatch(/if \(totalMealsLogged > 0\) maybeAskForReview/);
  });
});
