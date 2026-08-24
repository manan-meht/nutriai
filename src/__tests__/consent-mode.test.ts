import fs from "fs";
import path from "path";
import {
  CONSENT_REQUIRED_COUNTRIES,
  consentDefaultPayload,
  consentRequiredFor,
  consentUpdatePayload,
  parseConsent,
  shouldShowBanner,
} from "@/lib/privacy/consent";

const code = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf-8");

describe("who gets asked", () => {
  it("asks every EEA state and the UK", () => {
    for (const c of ["DE", "FR", "IE", "PL", "RO", "NO", "IS", "LI", "GB"]) {
      expect(consentRequiredFor(c)).toBe(true);
    }
    expect(CONSENT_REQUIRED_COUNTRIES.size).toBe(31); // EU 27 + IS/LI/NO + GB
  });

  it("leaves the launch markets untouched", () => {
    // The banner must never appear in Singapore, India, the US or Australia —
    // there is no prior-consent rule there, and showing it would cost
    // conversions for nothing.
    for (const c of ["SG", "IN", "US", "AU"]) {
      expect(consentRequiredFor(c)).toBe(false);
    }
  });

  it("asks when the country is unknown", () => {
    // Cloudflare returns XX/T1 for unresolvable IPs, and local dev has no
    // header at all. Asking someone who did not need asking is a far cheaper
    // mistake than silently tracking someone who did.
    expect(consentRequiredFor(null)).toBe(true);
    expect(consentRequiredFor(undefined)).toBe(true);
    expect(consentRequiredFor("")).toBe(true);
  });

  it("is case-insensitive about the header value", () => {
    expect(consentRequiredFor("de")).toBe(true);
    expect(consentRequiredFor("sg")).toBe(false);
  });
});

describe("consent defaults", () => {
  it("denies advertising storage for an EEA visitor who has not chosen", () => {
    const p = consentDefaultPayload({ required: true, stored: null });
    for (const s of ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"]) {
      expect(p).toContain(`'${s}':'denied'`);
    }
  });

  it("grants outside the EEA, so those markets are unchanged", () => {
    const p = consentDefaultPayload({ required: false, stored: null });
    expect(p).toContain("'ad_storage':'granted'");
    expect(p).not.toContain("denied");
  });

  it("remembers a returning visitor's acceptance", () => {
    const p = consentDefaultPayload({ required: true, stored: "granted" });
    expect(p).toContain("'ad_storage':'granted'");
  });

  it("keeps a returning visitor's refusal", () => {
    const p = consentDefaultPayload({ required: true, stored: "denied" });
    expect(p).toContain("'ad_storage':'denied'");
  });

  it("never gates strictly-necessary storage", () => {
    expect(consentDefaultPayload({ required: true, stored: null }))
      .toContain("'security_storage':'granted'");
  });

  it("waits for a stored choice before firing, but only where it must", () => {
    expect(consentDefaultPayload({ required: true, stored: null })).toContain("'wait_for_update':500");
    expect(consentDefaultPayload({ required: false, stored: null })).not.toContain("wait_for_update");
  });

  it("updates all four gated signals together", () => {
    expect(consentUpdatePayload("granted")).toEqual({
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
    });
  });
});

describe("stored choice", () => {
  it("treats anything unrecognised as no choice made", () => {
    // A tampered or stale cookie must re-ask rather than silently grant.
    expect(parseConsent("yes")).toBeNull();
    expect(parseConsent("true")).toBeNull();
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("granted")).toBe("granted");
    expect(parseConsent("denied")).toBe("denied");
  });

  it("shows the banner only to an EEA visitor who has not chosen", () => {
    expect(shouldShowBanner({ required: true, stored: null })).toBe(true);
    expect(shouldShowBanner({ required: true, stored: "denied" })).toBe(false);
    expect(shouldShowBanner({ required: true, stored: "granted" })).toBe(false);
    expect(shouldShowBanner({ required: false, stored: null })).toBe(false);
  });
});

describe("the emitted tag", () => {
  const tag = code("components/marketing/GoogleAdsTag.tsx");

  it("sets consent BEFORE configuring the tag", () => {
    // The whole mechanism depends on this order: a config processed before
    // the consent default fires under the wrong state.
    const consentAt = tag.indexOf("'consent','default'");
    const configAt = tag.indexOf("gtag('config'");
    expect(consentAt).toBeGreaterThan(-1);
    expect(configAt).toBeGreaterThan(consentAt);
  });

  it("keeps consent and config in one script, not two", () => {
    // React hoists <script async src> into the head independently of JSX
    // position, so splitting these across scripts would make their order
    // depend on undefined behaviour.
    const bootstrap = tag.slice(tag.indexOf("const bootstrap"), tag.indexOf("return ("));
    expect(bootstrap).toContain("'consent','default'");
    expect(bootstrap).toContain("gtag('config'");
  });

  it("reads the country from Cloudflare's trusted header", () => {
    expect(tag).toMatch(/cf-ipcountry/);
  });
});

describe("the banner itself", () => {
  const banner = code("components/marketing/ConsentBanner.tsx");

  it("makes rejecting exactly as easy as accepting", () => {
    // A prominent Accept beside a muted Reject is treated as invalid consent.
    // Both buttons must carry the same classes.
    const classes = [...banner.matchAll(/className="([^"]*rounded-full[^"]*)"/g)].map((m) => m[1]);
    expect(classes).toHaveLength(2);
    expect(classes[0]).toBe(classes[1]);
  });

  it("offers both choices, not just acceptance", () => {
    expect(banner).toMatch(/choose\("denied"\)/);
    expect(banner).toMatch(/choose\("granted"\)/);
  });

  it("applies the choice to the already-loaded tag", () => {
    // Without the update call the decision would not take effect until the
    // next navigation.
    expect(banner).toMatch(/gtag\?\.\("consent", "update"/);
  });

  it("stores the choice on a Secure, SameSite cookie", () => {
    expect(banner).toMatch(/SameSite=Lax/);
    expect(banner).toMatch(/Secure/);
  });

  it("links to the privacy policy", () => {
    expect(banner).toMatch(/href="\/privacy"/);
  });
});

describe("withdrawing consent", () => {
  const btn = code("components/marketing/ConsentPreferencesButton.tsx");

  it("exists at all", () => {
    // Consent that cannot be withdrawn as easily as it was given is not
    // valid consent, however good the prompt was.
    expect(btn).toMatch(/CONSENT_COOKIE/);
  });

  it("clears the cookie so the prompt returns", () => {
    expect(btn).toMatch(/max-age=0/);
  });

  it("revokes immediately rather than waiting for the reload", () => {
    expect(btn).toMatch(/consentUpdatePayload\("denied"\)/);
  });

  it("is reachable from the privacy policy", () => {
    expect(code("app/(public)/privacy/page.tsx")).toMatch(/<ConsentPreferencesButton \/>/);
  });

  it("fixes the duplicate section number while it is there", () => {
    const page = code("app/(public)/privacy/page.tsx");
    expect(page).toMatch(/13\. Cookies and advertising/);
    expect(page).toMatch(/14\. Contact/);
    expect(page).not.toMatch(/12\. Contact/);
  });
});
