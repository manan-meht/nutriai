import fs from "fs";
import path from "path";
import { isClubHost, isClubWwwHost, normalizeHost } from "@/lib/club/host";

// Tistra Club answers on more than one hostname. Getting the set wrong is a
// quiet failure: an unrecognised club host falls through to Tistra Health
// and serves the wrong product's homepage, which is exactly what
// club.tistrahealth.com did before its rewrite existed.

describe("club host recognition", () => {
  it.each([
    "tistra.club",
    "www.tistra.club",
    "club.tistrahealth.com",
    "TISTRA.CLUB",
    "tistra.club:3001",
    "club.localhost:3001",
  ])("%s serves the club", (host) => {
    expect(isClubHost(host)).toBe(true);
  });

  it.each([
    "tistrahealth.com",
    "coach.tistrahealth.com",
    "family.tistrahealth.com",
    "localhost:3001",
    "",
  ])("%s does not", (host) => {
    expect(isClubHost(host)).toBe(false);
  });

  it("does not match a lookalike domain someone else could register", () => {
    // Substring matching would hand the club to any host merely containing
    // the name.
    expect(isClubHost("tistra.club.evil.example")).toBe(false);
    expect(isClubHost("nottistra.club")).toBe(false);
    expect(isClubHost("evil-tistra.club")).toBe(false);
  });

  it("handles a missing host header rather than throwing", () => {
    expect(isClubHost(null)).toBe(false);
    expect(isClubHost(undefined)).toBe(false);
    expect(normalizeHost(null)).toBe("");
  });

  it("identifies only the www form for canonicalisation", () => {
    expect(isClubWwwHost("www.tistra.club")).toBe(true);
    expect(isClubWwwHost("tistra.club")).toBe(false);
    expect(isClubWwwHost("club.tistrahealth.com")).toBe(false);
  });
});

describe("every surface uses the shared check", () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

  it.each([
    "middleware.ts",
    "app/(public)/login/page.tsx",
    "app/(public)/signup/page.tsx",
  ])("%s imports isClubHost instead of its own check", (file) => {
    const src = read(file);
    expect(src).toMatch(/isClubHost/);
    // The old copied check — three places had it, and adding a second
    // hostname meant all three had to change together.
    expect(src).not.toMatch(/startsWith\("club\."\)/);
  });

  it("middleware redirects www to the apex", () => {
    // Host-only cookies make www and the apex separate origins for auth, so
    // signing in on one would look signed-out on the other.
    const mw = read("middleware.ts");
    expect(mw).toMatch(/isClubWwwHost\(host\)/);
    expect(mw).toMatch(/url\.host = "tistra\.club"/);
    expect(mw).toMatch(/308/);
  });
});

describe("club URLs carry no /club prefix", () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
  const CLUB_UI = [
    "components/club/ClubChrome.tsx",
    "components/club/CoachCardList.tsx",
    "app/(club)/club/page.tsx",
    "app/(club)/club/coaches/[coachId]/page.tsx",
    "app/(club)/club/coaches/[coachId]/book/page.tsx",
    "app/(club)/club/checkout/[holdId]/page.tsx",
    "app/(club)/club/bookings/page.tsx",
    "app/(club)/club/bookings/[bookingId]/page.tsx",
    "app/(club)/club/profile/page.tsx",
    "app/(club)/club/browse/page.tsx",
    "components/club/SwipeFeed.tsx",
    "app/(club)/club/actions.ts",
  ];

  it.each(CLUB_UI)("%s links without the prefix", (file) => {
    const src = read(file);
    // Import paths (@/lib/club/...) are not URLs; only quoted/templated
    // absolute paths and encoded next= params count.
    const urls = [
      ...src.matchAll(/href=(?:"([^"]*)"|\{`([^`]*)`\})/g),
      ...src.matchAll(/redirect\(\s*(?:"([^"]*)"|`([^`]*)`)/g),
    ].map((m) => m[1] ?? m[2] ?? "");
    const leaked = urls.filter((u) => u === "/club" || u.startsWith("/club/") || u.startsWith("/club?"));
    expect(leaked).toEqual([]);
    expect(src).not.toMatch(/%2Fclub/);
  });

  it("the discovery tab points at the root", () => {
    expect(read("components/club/ClubChrome.tsx")).toMatch(/href: "\/"/);
  });

  it("placeholder photos live outside the /club namespace", () => {
    // /club/coaches/<file>.webp would share a namespace with the
    // /coaches/<id> profile routes once the prefix is stripped.
    expect(read("lib/club/placeholder-photos.ts")).toMatch(/const BASE = "\/coach-photos"/);
    expect(fs.existsSync(path.join(__dirname, "..", "..", "public", "club"))).toBe(false);
  });
});

describe("middleware canonicalises club URLs", () => {
  const mw = fs.readFileSync(path.join(__dirname, "..", "middleware.ts"), "utf-8");

  it("redirects a leaked /club link on a club host instead of rewriting it", () => {
    // A rewrite would leave /club in the address bar, and every link the
    // page then renders would inherit it.
    expect(mw).toMatch(/pathname === "\/club" \|\| pathname\.startsWith\("\/club\/"\)/);
    expect(mw).toMatch(/NextResponse\.redirect\(url, 308\)/);
  });

  it("rewrites clean paths into the /club route group", () => {
    expect(mw).toMatch(/url\.pathname = `\/club\$\{pathname === "\/" \? "" : pathname\}`/);
    expect(mw).toMatch(/NextResponse\.rewrite\(url\)/);
  });

  it("sends /club on a non-club host to the club's own origin", () => {
    expect(mw).toMatch(/CLUB_CANONICAL_ORIGIN/);
  });

  it("but never in local development", () => {
    // One dev server answers for every product. Sending /club to the
    // production domain made the club unreachable on a laptop — the same
    // trap the coach routes hit, found the same way.
    expect(mw).toMatch(/!isLocalDevHost\(host\) &&/);
  });

  it("leaves shared paths alone on every host", () => {
    for (const p of ["/api", "/auth", "/login", "/signup", "/_next", "/privacy", "/terms"]) {
      expect(mw).toContain(`pathname.startsWith("${p}")`);
    }
  });
});

// Coaching is a separate product from Tistra Health and moved off that
// domain entirely (Aug 2026). coach.tistrahealth.com survives only as a
// redirect, so existing links, bookmarks and in-flight OAuth callbacks land
// somewhere correct instead of 404ing.
describe("coach product lives on its own domain", () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

  it("resolves coach.tistra.club to the coach product", () => {
    const { resolveProductFromHostnameOnly, getProductDomain } = require("@/lib/product/resolve-product");
    expect(resolveProductFromHostnameOnly("coach.tistra.club")).toBe("gym");
    expect(getProductDomain("gym")).toBe("coach.tistra.club");
  });

  it("still resolves the old host, so a stale link reaches the right product", () => {
    const { resolveProductFromHostnameOnly } = require("@/lib/product/resolve-product");
    expect(resolveProductFromHostnameOnly("coach.tistrahealth.com")).toBe("gym");
  });

  it("does not mistake the coach subdomain for the club", () => {
    // tistra.club is the club; coach.tistra.club is a different product on
    // the same registrable domain.
    expect(isClubHost("coach.tistra.club")).toBe(false);
  });

  it("redirects the whole legacy host, preserving path and query", () => {
    const mw = read("middleware.ts");
    expect(mw).toMatch(/isLegacyCoachHost\(host\)/);
    expect(mw).toMatch(/COACH_CANONICAL_ORIGIN\}\$\{request\.nextUrl\.pathname\}\$\{request\.nextUrl\.search\}/);
  });

  it("shares a session across each registrable domain, never between them", () => {
    const { getCookieDomain } = require("@/lib/supabase/cookie-domain");
    expect(getCookieDomain("coach.tistra.club")).toBe(".tistra.club");
    expect(getCookieDomain("tistra.club")).toBe(".tistra.club");
    expect(getCookieDomain("coach.tistrahealth.com")).toBe(".tistrahealth.com");
    // A different eTLD+1 cannot share a cookie; the browser rejects it.
    expect(getCookieDomain("example.com")).toBeUndefined();
  });
});

describe("Coach OS URLs carry no /coach prefix", () => {
  const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
  const { COACH_APP_SEGMENTS, isCoachAppPath, isPrefixedCoachAppPath, isCoachHost } = require("@/lib/coach/routes");

  it("the segment list matches the actual route directories", () => {
    // If a new Coach OS section is added without updating the list, its
    // clean URL would 404 while /coach/<section> quietly kept working.
    const dir = path.join(__dirname, "..", "app", "(coach)", "coach");
    const actual = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect([...COACH_APP_SEGMENTS].sort()).toEqual(actual);
  });

  it("maps app paths but leaves marketing pages alone", () => {
    expect(isCoachAppPath("/dashboard")).toBe(true);
    expect(isCoachAppPath("/clients/abc")).toBe(true);
    // /coach/india and /coach/add-users are real marketing pages; sweeping
    // the whole prefix would send them to /india and /add-users.
    expect(isPrefixedCoachAppPath("/coach/india")).toBe(false);
    expect(isPrefixedCoachAppPath("/coach/add-users")).toBe(false);
    expect(isPrefixedCoachAppPath("/coach/dashboard")).toBe(true);
    expect(isCoachAppPath("/")).toBe(false);
    expect(isCoachAppPath("/pricing")).toBe(false);
  });

  it("recognises the coach host and not the club", () => {
    expect(isCoachHost("coach.tistra.club")).toBe(true);
    expect(isCoachHost("tistra.club")).toBe(false);
  });

  it("resolves clean coach URLs in local dev, but never on the Health host", () => {
    // One dev server answers for every product, so without this every
    // un-prefixed Coach OS link 404s locally while working in production —
    // a trap rather than a safeguard. tistrahealth.com must still never
    // open the coach product from /dashboard.
    const { servesCoachApp, isLocalDevHost } = require("@/lib/coach/routes");
    expect(isLocalDevHost("localhost:3001")).toBe(true);
    expect(isLocalDevHost("127.0.0.1")).toBe(true);
    // Phone-on-the-same-wifi testing reaches the dev server by the
    // machine's LAN address; production requests never carry one.
    expect(isLocalDevHost("192.168.1.169:3001")).toBe(true);
    expect(isLocalDevHost("10.0.0.5")).toBe(true);
    expect(isLocalDevHost("172.20.0.7")).toBe(true);
    expect(isLocalDevHost("172.32.0.1")).toBe(false); // outside the 172.16-31 private block
    expect(servesCoachApp("localhost:3001")).toBe(true);
    expect(servesCoachApp("coach.tistra.club")).toBe(true);
    expect(servesCoachApp("tistrahealth.com")).toBe(false);
    expect(servesCoachApp("tistra.club")).toBe(false);
    expect(isLocalDevHost("notlocalhost.com")).toBe(false);
  });

  it("Coach OS components link without the prefix", () => {
    for (const f of fs.readdirSync(path.join(__dirname, "..", "components", "coach"))) {
      if (!f.endsWith(".tsx")) continue;
      expect([f, /["`]\/coach\//.test(read(path.join("components", "coach", f)))]).toEqual([f, false]);
    }
  });

  it("sign-in lands a coach on the clean dashboard URL", () => {
    expect(read("components/auth/AuthForm.tsx")).toMatch(/dashboardUrl: "\/dashboard"/);
    expect(read("app/(public)/login/page.tsx")).toMatch(/isCoachHost\(hostname\) \? "\/dashboard"/);
  });
});

describe("club clean URLs in local development", () => {
  const { isClubAppPath, CLUB_APP_SEGMENTS } = require("@/lib/club/host");

  it("the segment list matches the actual route directories", () => {
    // A new club section added without updating this would 404 on its
    // clean URL locally while working in production — the worst place for
    // a difference, because it only shows up when someone develops.
    const dir = path.join(__dirname, "..", "app", "(club)", "club");
    const actual = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    expect([...CLUB_APP_SEGMENTS].sort()).toEqual(actual);
  });

  it("maps the app's segments but never the root", () => {
    expect(isClubAppPath("/coaches/abc")).toBe(true);
    expect(isClubAppPath("/bookings")).toBe(true);
    // "/" stays Tistra Health locally: one dev server cannot give the root
    // to two products.
    expect(isClubAppPath("/")).toBe(false);
    expect(isClubAppPath("/pricing")).toBe(false);
  });

  it("middleware rewrites them only on a local host", () => {
    const mw = fs.readFileSync(path.join(__dirname, "..", "middleware.ts"), "utf-8");
    expect(mw).toMatch(/isLocalDevHost\(host\) && !isSharedPath && isClubAppPath\(pathname\)/);
  });
});
