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

  it("leaves shared paths alone on every host", () => {
    for (const p of ["/api", "/auth", "/login", "/signup", "/_next", "/privacy", "/terms"]) {
      expect(mw).toContain(`pathname.startsWith("${p}")`);
    }
  });
});
