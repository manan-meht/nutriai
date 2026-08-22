import fs from "fs";
import path from "path";

// The coach-facing half of class packs: offering 5, 10 or 20 of a class
// for less than the singles cost.
//
// The risk here is a mispriced pack going live — a "discount" that costs
// more than buying singly, or one attached to the wrong class. Both are
// invisible to the coach unless the screen does the arithmetic for them.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
/** Strips comments before a negative assertion. Line comments FIRST (a
 * "//" line containing "/*" would otherwise open a block), and never strip
 * lines beginning with "*" — that deletes a JSDoc's closing marker, after
 * which the opener matches a far-later one and swallows real code. */
const code = (p: string) =>
  src(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const ACTIONS = "app/(coach)/coach/actions.ts";
const UI = "components/coach/CoachSettings.tsx";

describe("a pack cannot be published at a bad price", () => {
  it("validates against the service's own price, read on the server", () => {
    // Trusting a single price from the client would let a forged one wave
    // through a pack dearer than buying singly.
    const t = code(ACTIONS);
    const fn = t.slice(t.indexOf("export async function upsertClassPack"));
    expect(fn).toMatch(/\.from\("coach_services"\)[\s\S]{0,200}\.eq\("coach_profile_id", coach\.id\)/);
    expect(fn).toMatch(/packPriceProblem\(service\.price_cents/);
  });

  it("scopes the write to the coach who owns the service", () => {
    const t = code(ACTIONS);
    const fn = t.slice(t.indexOf("export async function upsertClassPack"));
    expect(fn).toMatch(/\.eq\("coach_profile_id", coach\.id\)/);
  });

  it("explains a duplicate pack in the coach's terms", () => {
    const t = code(ACTIONS);
    expect(t).toMatch(/already have a \$\{input\.classCount\}-class pack/);
  });
});

describe("withdrawing a pack", () => {
  it("deactivates rather than deletes", () => {
    // Credits already bought reference the row, and someone part-way
    // through a 10-pack keeps the terms they paid for.
    const t = code(ACTIONS);
    expect(t).toMatch(/export async function setClassPackActive/);
    const from = t.indexOf("export async function setClassPackActive");
    const fn = t.slice(from, t.indexOf("export async function", from + 10));
    expect(fn).toMatch(/\.update\(\{ is_active: isActive/);
    expect(fn).not.toMatch(/\.delete\(\)/);
  });
});

describe("what the coach sees while setting a price", () => {
  it("shows the per-class price and the saving as they type", () => {
    // These are the two numbers a client will see; without them the coach
    // is doing the division in their head.
    const t = code(UI);
    expect(t).toMatch(/perClassCents\(priceCents, size\)/);
    expect(t).toMatch(/savingPercent\(service\.priceCents, priceCents, size\)/);
  });

  it("shows the problem before the save is attempted", () => {
    expect(code(UI)).toMatch(/packPriceProblem\(service\.priceCents, priceCents, size\)/);
  });

  it("keeps a rejected price on screen", () => {
    // Clearing the form on failure loses what they typed next to the
    // reason it was refused.
    const t = code(UI);
    expect(t).toMatch(/if \(res\.ok\) \{[\s\S]{0,80}setOpen\(false\)/);
  });

  it("offers only the three sizes the database accepts", () => {
    const t = code(UI);
    expect(t).toMatch(/PACK_SIZES\.map/);
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "..", "supabase/migrations/0061_attendees_and_class_packs.sql"),
      "utf-8"
    );
    expect(migration).toMatch(/class_count in \(5, 10, 20\)/);
  });
});

describe("packs sit under the class they discount", () => {
  it("filters to the service they belong to", () => {
    // Listed separately, a coach matches pack to class by name — which is
    // where a pack ends up attached to the wrong one.
    expect(code(UI)).toMatch(/classPacks\.filter\(\(p\) => p\.serviceId === s\.id\)/);
  });

  it("is loaded with the rest of the settings, not per service", () => {
    expect(code("app/(coach)/coach/settings/page.tsx")).toMatch(/from\("coach_class_packs"\)/);
  });
});
