import fs from "fs";
import path from "path";

/** A missing meal photo has two different causes and they must not render
 * the same way.
 *
 * - image_url IS NULL          -> the meal was described in WhatsApp text.
 *                                 Normal; ~15% of submissions.
 * - image_url set, signing failed -> a photo exists and we could not load
 *                                 it. Our bug.
 *
 * resolveSignedMealPhotoUrl returns undefined for both, so before this the
 * two collapsed into one blank grey box: the storage failure was invisible
 * and a text-logged meal looked broken. hasStoredPhoto is what separates
 * them, and it is derived from the raw column, never from the signed URL.
 */

const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("hasStoredPhoto is derived from the raw column", () => {
  const actions = code(read("app/(admin)/admin/actions.ts"));

  it("is exposed on the queue item, the detail, and same-day meals", () => {
    // Three separate mappings, each of which had the same collapsed state.
    expect((actions.match(/hasStoredPhoto: !!row\.image_url/g) ?? []).length).toBe(2);
    expect(actions).toMatch(/hasStoredPhoto: !!r\.image_url/);
  });

  it("never derives it from the signed URL", () => {
    // The signed URL is undefined in BOTH cases, so deriving from it would
    // reintroduce exactly the bug this fixes.
    expect(actions).not.toMatch(/hasStoredPhoto: !!(submissionImageUrl|signedImageUrls)/);
  });
});

describe("the review page tells the two causes apart", () => {
  const form = code(read("components/admin/ReviewForm.tsx"));

  it("no longer shows one ambiguous 'No photo available'", () => {
    expect(form).not.toMatch(/No photo available/);
  });

  it("names a storage failure as ours, not as a missing photo", () => {
    expect(form).toMatch(/Photo could not be loaded/);
    expect(form).toMatch(/hasStoredPhoto \? \(/);
  });

  it("says plainly when a meal was logged from text", () => {
    expect(form).toMatch(/Described in text/);
  });
});

describe("quantities are not labelled 'visible' when nothing was seen", () => {
  const form = code(read("components/admin/ReviewForm.tsx"));

  it("switches the heading on whether a photo existed", () => {
    // One prompt serves both paths and always asks for visible_quantity,
    // so the strings exist either way — only the label can be honest.
    expect(form).toMatch(/hasStoredPhoto \? "Visible quantities" : "Estimated quantities \(from description\)"/);
  });

  it("warns the reviewer that there is nothing to check against", () => {
    // A confirmed review feeds food_knowledge_base, so a "Correct" here
    // carries the same weight as one verified against a photo.
    const idx = form.indexOf("Estimated quantities");
    expect(idx).toBeGreaterThan(-1);
    expect(form.slice(idx, idx + 600)).toMatch(/inferred from the caption/);
  });

  it("keeps the original label when a photo really was analysed", () => {
    // Signing can fail after the fact; the AI still saw the image at
    // classification time, so "visible" remains accurate.
    expect(form).toMatch(/"Visible quantities"/);
  });
});

describe("the queue distinguishes them too", () => {
  const queue = code(read("app/(admin)/admin/page.tsx"));
  const placeholder = code(read("components/admin/PhotoPlaceholder.tsx"));

  it("both queue layouts use the placeholder rather than a blank box", () => {
    expect((queue.match(/<PhotoPlaceholder/g) ?? []).length).toBe(2);
    expect(queue).not.toMatch(/w-16 h-16 rounded-xl bg-gray-100/);
    expect(queue).not.toMatch(/w-10 h-10 rounded-lg bg-gray-100/);
  });

  it("the placeholder renders a different state for each cause", () => {
    expect(placeholder).toMatch(/hasStoredPhoto \?/);
    // A failure is coloured as one; a text meal is not an error.
    expect(placeholder).toMatch(/bg-red-50/);
    expect(placeholder).toMatch(/bg-gray-100/);
  });

  it("each state explains itself on hover and to a screen reader", () => {
    expect((placeholder.match(/title=/g) ?? []).length).toBe(2);
    expect((placeholder.match(/aria-label=/g) ?? []).length).toBe(2);
  });
});

/** "Save and next" navigates to the same route with a different ?id.
 *
 * React reconciles that as the same component in the same position, so the
 * instance is preserved and every useState(initialValue) keeps the
 * PREVIOUS submission's value. Props-driven output (photo, caption,
 * detected items) updates; state-driven output (food items, macro totals,
 * toggles, notes, review status) does not.
 *
 * That is not only a display bug. foodItems is what buildInput() sends, and
 * saveHumanReview writes per-item macro corrections into the real meal_logs
 * row by matching on lowercased food name. Two "Save and next" presses in a
 * row would write meal A's macros into meal B's log for every food name the
 * two happen to share — "rice", "egg", "toast" — and collapse them to an
 * exact value flagged as human-confirmed.
 */
describe("the review form resets between submissions", () => {
  const page = read("app/(admin)/admin/page.tsx");
  const form = read("components/admin/ReviewForm.tsx");

  it("is keyed on the submission id so navigation remounts it", () => {
    expect(code(page)).toMatch(/<ReviewForm\s+key=\{detail\.submission\.id\}/);
  });

  it("still initialises its state from props, which is what the key resets", () => {
    // If these ever became prop-derived on every render the key would be
    // redundant — but they are not, so it is load-bearing.
    expect(code(form)).toMatch(/useState\(latestReview\?\.reviewStatus/);
    expect(code(form)).toMatch(/useState<CorrectedFoodItem\[\]>/);
  });

  it("macro totals are derived from that state, not from the server payload", () => {
    // This is why the AI classification panel appeared half-updated: the
    // model and detected items come from props, the macros from state.
    expect(code(form)).toMatch(/useMemo\([\s\S]{0,400}?foodItems\.reduce/);
  });
});
