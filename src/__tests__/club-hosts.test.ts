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
