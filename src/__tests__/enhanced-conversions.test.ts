import fs from "fs";
import path from "path";
import { enhancedConversionsAllowed } from "@/lib/privacy/consent";
import { userDataScript } from "@/lib/privacy/enhanced-conversions";

/** Google Ads recommended moving from automatic to in-page enhanced
 * conversions, and it was right: automatic collection scrapes the
 * conversion page's DOM for an email field, and /settings/published — a
 * "your profile is live" confirmation — has no inputs at all. It was
 * contributing nothing.
 *
 * Sending a hashed email to Google is personal data processed for
 * advertising, so it follows ad_user_data: allowed outside the EEA/UK,
 * inside only once accepted.
 */
const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");
const PAGE = "app/(coach)/coach/settings/published/page.tsx";

describe("the consent gate", () => {
  it("allows it outside the EEA/UK", () => {
    expect(enhancedConversionsAllowed({ required: false, stored: null })).toBe(true);
  });

  it("withholds it from an EEA visitor who has not chosen", () => {
    expect(enhancedConversionsAllowed({ required: true, stored: null })).toBe(false);
  });

  it("withholds it from an EEA visitor who declined", () => {
    expect(enhancedConversionsAllowed({ required: true, stored: "denied" })).toBe(false);
  });

  it("allows it once an EEA visitor accepts", () => {
    expect(enhancedConversionsAllowed({ required: true, stored: "granted" })).toBe(true);
  });

  it("matches the ad_user_data rule exactly", () => {
    // If these ever diverge, the page would send hashed email under a
    // consent state that Consent Mode itself treats as denied.
    for (const required of [true, false]) {
      for (const stored of ["granted", "denied", null] as const) {
        const consentModeGrants = !required || stored === "granted";
        expect(enhancedConversionsAllowed({ required, stored })).toBe(consentModeGrants);
      }
    }
  });
});

const OK = { required: false, stored: null } as const;

describe("the payload it builds", () => {
  it("sets user_data with the address", () => {
    expect(userDataScript("Coach@Example.com", OK)).toBe(
      `gtag('set', 'user_data', {"email":"coach@example.com"});\n`
    );
  });

  it("emits nothing at all when consent withholds it", () => {
    // Not a denied payload — nothing. Auditable from the page source.
    expect(userDataScript("coach@example.com", { required: true, stored: null })).toBe("");
    expect(userDataScript("coach@example.com", { required: true, stored: "denied" })).toBe("");
  });

  it("emits it once an EEA visitor accepts", () => {
    expect(userDataScript("coach@example.com", { required: true, stored: "granted" })).toContain(
      "coach@example.com"
    );
  });

  it("emits nothing when there is no address", () => {
    for (const bad of [null, undefined, "", "not-an-email", "@nope.com", "nope@"]) {
      expect(userDataScript(bad, OK)).toBe("");
    }
  });

  it("strips a product scope tag", () => {
    // A +nutriai-adults address hashes to something Google can never match.
    expect(userDataScript("coach+nutriai-adults@example.com", OK)).toContain(
      `{"email":"coach@example.com"}`
    );
  });

  it("cannot close the script tag from the address", () => {
    const out = userDataScript(`a</script><script>alert(1)</script>@x.com`, OK);
    expect(out).not.toContain("</script>");
    expect(out).toContain("\\u003c");
  });

  it("escapes quotes rather than breaking the literal", () => {
    const out = userDataScript(`a"b@x.com`, OK);
    expect(out).toContain('\\"');
    expect(() => JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1))).not.toThrow();
  });

  it("ends in a newline so the conversion event starts on its own line", () => {
    expect(userDataScript("coach@example.com", OK).endsWith("\n")).toBe(true);
  });
});

describe("the conversion page wires it correctly", () => {
  const page = read(PAGE);

  it("sets user_data before the conversion event, never after", () => {
    // gtag applies a user_data set to subsequent events only.
    expect(page).toMatch(/\$\{userData\}gtag\('event', 'conversion'/);
  });

  it("passes the real consent state, not a hardcoded allow", () => {
    expect(page).toMatch(/required: consentRequiredFor\(country\)/);
    expect(page).toMatch(/stored,/);
  });

  it("still refuses to fire without a conversion label", () => {
    expect(page).toMatch(/\{CONVERSION_LABEL &&/);
  });

  it("stays out of search results", () => {
    expect(page).toMatch(/robots: \{ index: false, follow: false \}/);
  });
});

describe("the privacy policy says what is sent", () => {
  const policy = read("app/(public)/privacy/content.ts");

  it("discloses that a hashed email goes to Google Ads", () => {
    expect(policy).toMatch(/irreversible hash in the browser/);
    expect(policy).toMatch(/Google Ads/);
  });

  it("says EEA and UK visitors who decline have nothing sent", () => {
    expect(policy).toMatch(/decline advertising cookies have no email address included/);
  });

  it("keeps health data out of advertising measurement", () => {
    expect(policy).toMatch(/never included in advertising measurement/);
  });
});
