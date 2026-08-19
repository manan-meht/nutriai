import fs from "fs";
import path from "path";

// Coach OS is the overarching system and is free to use. Nutrition
// tracking — the former standalone gym dashboard — is the one paid feature
// housed inside it.
//
// This pins the commercial boundary, which is easy to move by accident:
// adding an entitlement check to a shell page would paywall the whole
// product, and removing the one on Nutrition would give the paid feature
// away. Both mistakes are silent.

const COACH_APP = path.join(__dirname, "..", "app", "(coach)", "coach");
const read = (p: string) => fs.readFileSync(path.join(COACH_APP, p), "utf-8");

/** Every Coach OS page except the paid one. */
const FREE_PAGES = ["dashboard/page.tsx", "calendar/page.tsx", "clients/page.tsx", "payments/page.tsx", "settings/page.tsx"];

const PAYWALL_SIGNALS = [/getEntitlementSnapshot/, /requiresCardBeforeFirstTrial/, /choosePlanAndCheckout/];

describe("Coach OS is free", () => {
  it.each(FREE_PAGES)("%s does not gate on payment", (file) => {
    const body = read(file);
    for (const signal of PAYWALL_SIGNALS) expect(body).not.toMatch(signal);
  });

  it("every free page actually exists", () => {
    for (const file of FREE_PAGES) {
      expect([file, fs.existsSync(path.join(COACH_APP, file))]).toEqual([file, true]);
    }
  });
});

describe("Nutrition tracking is the paid feature", () => {
  const nutrition = read("nutrition/page.tsx");

  it("checks the entitlement", () => {
    expect(nutrition).toMatch(/getEntitlementSnapshot\(workspace\.id, "gym", user\.email\)/);
  });

  it("renders inside the Coach OS shell rather than standing alone", () => {
    expect(nutrition).toMatch(/CoachShell/);
    expect(nutrition).toMatch(/active="nutrition"/);
  });

  it("is reachable from the Coach OS nav", () => {
    const shell = fs.readFileSync(path.join(__dirname, "..", "components", "coach", "CoachShell.tsx"), "utf-8");
    // Coach OS is served from the root of the coach host.
    expect(shell).toMatch(/href: "\/nutrition"/);
  });

  it("resolves the workspace from the signed-in user, never a parameter", () => {
    // Same authorization rule as the rest of Coach OS: no page accepts an
    // id that would let a caller read someone else's data.
    expect(nutrition).toMatch(/getOrCreateWorkspace\(user\.id/);
    expect(nutrition).not.toMatch(/params\.workspaceId/);
  });
});

describe("the standalone gym dashboard no longer exists", () => {
  const legacy = fs.readFileSync(
    path.join(__dirname, "..", "app", "(gym)", "gym", "dashboard", "page.tsx"),
    "utf-8"
  );

  it("redirects into Coach OS", () => {
    expect(legacy).toMatch(/redirect\(`\/coach\/nutrition/);
  });

  it("forwards query params so Checkout and /pricing hand-offs survive", () => {
    // ?checkout=success and ?plan=&interval= both arrive here from external
    // redirects that can't be updated retroactively.
    expect(legacy).toMatch(/URLSearchParams/);
  });

  it("no longer renders a dashboard of its own", () => {
    expect(legacy).not.toMatch(/GymDashboardClient/);
  });
});

describe("the two client lists are labelled, not silently merged", () => {
  // The identity decision (Aug 2026) was to defer merging: a matching
  // WhatsApp number is not treated as proof of the same person, because
  // household numbers are shared and meal photos are health data. What the
  // product owes a coach instead is an explanation of where each kind of
  // client lives.
  const clientsList = fs.readFileSync(
    path.join(__dirname, "..", "components", "coach", "CoachClients.tsx"),
    "utf-8"
  );
  const nutrition = read("nutrition/page.tsx");

  it("the booking list points at nutrition", () => {
    expect(clientsList).toMatch(/href="\/nutrition"/);
    expect(clientsList).toMatch(/Booking clients/);
  });

  it("the nutrition list points back at bookings", () => {
    expect(nutrition).toMatch(/href="\/clients"/);
  });

  it("nothing auto-links the two on a phone number", () => {
    for (const body of [clientsList, nutrition]) {
      expect(body).not.toMatch(/autoLink|matchByPhone|linkByWhatsapp/i);
    }
  });
});
