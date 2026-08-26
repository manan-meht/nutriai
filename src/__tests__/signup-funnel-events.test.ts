import fs from "fs";
import path from "path";

/** The coach funnel had exactly one measurable point — profile published —
 * which sits eight steps and a bank account past the ad click. Google Ads
 * has a handful of conversions to learn from as a result, and there was no
 * way to tell "nobody clicks the CTA" from "they click and abandon signup",
 * two problems with opposite fixes.
 *
 * signup_started and signup_completed were declared in the LandingEvent
 * union but never fired by any code. These pin them down.
 */

const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the signup funnel reports itself", () => {
  const form = code(read("components/auth/AuthForm.tsx"));

  it("fires signup_started on the attempt", () => {
    expect(form).toMatch(/track\("signup_started"/);
  });

  it("scopes started to signup, so signing in is not counted as one", () => {
    for (const m of form.matchAll(/track\("signup_started"/g)) {
      const before = form.slice(Math.max(0, m.index! - 120), m.index!);
      expect(before).toMatch(/mode === "signup"/);
    }
  });

  it("fires signup_completed only once, on the email path", () => {
    expect((form.match(/track\("signup_completed"/g) ?? []).length).toBe(1);
  });

  it("does not count an address that already has an account", () => {
    // Supabase reports success and sends nothing for a known address; the
    // identities check is what catches it, and completion must come after.
    const guard = form.indexOf("identities.length === 0");
    const completed = form.indexOf('track("signup_completed"');
    expect(guard).toBeGreaterThan(-1);
    expect(completed).toBeGreaterThan(guard);
  });

  it("labels the method so OAuth and email can be told apart", () => {
    expect(form).toMatch(/method: "email"/);
    expect(form).toMatch(/method: provider/);
  });

  it("carries the product, since this form serves three of them", () => {
    for (const m of form.matchAll(/track\("signup_(started|completed)", \{([^}]*)\}/g)) {
      expect(m[2]).toMatch(/product/);
    }
  });
});

describe("every declared landing event is actually fired", () => {
  const trackSrc = read("lib/landing/track.ts");
  const declared = [...trackSrc.matchAll(/\|\s*"([a-z_]+)"/g)].map((m) => m[1]);

  // Walks the tree rather than listing files. A hardcoded list is how this
  // check gives a false positive: the first draft missed OfferDetails.tsx
  // and reported a live event as dead.
  function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__" && entry.name !== "node_modules") walk(full, acc);
      } else if (/\.tsx?$/.test(entry.name) && !full.endsWith(path.join("lib", "landing", "track.ts"))) {
        acc.push(fs.readFileSync(full, "utf-8"));
      }
    }
    return acc;
  }
  const callers = walk(SRC).join("\n");

  it("declares the events it claims to", () => {
    expect(declared).toContain("signup_started");
    expect(declared).toContain("signup_completed");
    expect(declared.length).toBeGreaterThanOrEqual(8);
  });

  it("has a call site for each — a declared-but-dead event is a blind spot", () => {
    // This is exactly how signup_started and signup_completed sat unused:
    // present in the type, absent from the funnel, and invisible until
    // someone asked why Ads had no data.
    const dead = declared.filter((e) => !callers.includes(`"${e}"`));
    expect(dead).toEqual([]);
  });
});

describe("the unmeasured step is written down", () => {
  it("track.ts names the email-confirmation gap", () => {
    const t = read("lib/landing/track.ts");
    expect(t).toMatch(/KNOWN GAP/);
    expect(t).toMatch(/auth\/callback/);
  });
});
