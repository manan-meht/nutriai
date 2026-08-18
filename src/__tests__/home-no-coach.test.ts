import fs from "fs";
import path from "path";

// Tistra Health's own surfaces must not advertise coaching.
//
// Coaching is a separate product on a separate domain with its own signup.
// Every coach-facing link left on the Health homepage sent a visitor toward
// a product they can't sign up for here, and (before the split) into a
// signup path that no longer exists. This pins the removal so a future edit
// has to be deliberate.
//
// Scope is Health's own marketing chrome only. The coach host's landing
// (CoachLanding) and the routing in app/(public)/page.tsx that serves it
// obviously still name the product — that's the whole point of that file.

const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");

/** Health surfaces: rendered on tistrahealth.com for a consumer. */
const HEALTH_SURFACES = [
  "components/home/MasterHome.tsx",
  "components/home/UnifiedHome.tsx",
  "components/home/GetStartedModal.tsx",
];

/** Strips comments — the files explain *why* coaching was removed, and
 * that explanation must not itself trip the check. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("Tistra Health surfaces do not advertise coaching", () => {
  it.each(HEALTH_SURFACES)("%s has no coach-facing copy", (file) => {
    const body = code(read(file));
    expect(body).not.toMatch(/\bCoach\b/);
    expect(body).not.toMatch(/coaching/i);
    expect(body).not.toMatch(/getCoachAppUrl/);
  });

  it.each(HEALTH_SURFACES)("%s links nowhere coach-related", (file) => {
    const body = code(read(file));
    expect(body).not.toMatch(/["'`]\/coach/);
    expect(body).not.toMatch(/coach\.tistrahealth\.com/);
  });

  it("the shared marketing nav has no Coach link", () => {
    const nav = code(read("components/home/MarketingHeader.tsx"));
    expect(nav).not.toMatch(/href="\/coach"/);
  });

  it("the footer does not cross-sell coaching from Health pages", () => {
    const footer = code(read("components/home/MarketingFooter.tsx"));
    expect(footer).not.toMatch(/Switch to the coaching view/);
    // The coach variant's own tagline is allowed — that footer renders on
    // the coach host, where naming the product is correct.
    const taglines = footer.slice(footer.indexOf("const TAGLINE"), footer.indexOf("}", footer.indexOf("const TAGLINE")));
    expect(taglines).not.toMatch(/home: "[^"]*coach/i);
  });

  it("the neutral-host metadata does not describe coaching", () => {
    const page = read("app/(public)/page.tsx");
    // Just the two neutral-host metadata blocks. The CoachLanding import
    // above them and the gym block below them both belong to the coach
    // host and must stay.
    const neutral = page.slice(
      page.indexOf("if (!byHostname"),
      page.indexOf('if (product === "gym")')
    );
    expect(code(neutral)).not.toMatch(/coach/i);
  });

  it("still serves the coach product on its own host", () => {
    // The counter-check: removing the mentions must not have removed the
    // routing that makes coach.tistrahealth.com work.
    const page = read("app/(public)/page.tsx");
    expect(page).toMatch(/CoachLanding/);
  });
});
