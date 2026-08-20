import fs from "fs";
import path from "path";
import { scopedEmail } from "@/lib/auth";
import { splitAmount, DEFAULT_PLATFORM_FEE_PERCENT } from "@/lib/club/config";

// Guards for the Tistra Club consumer chain: discovery → profile → slot
// picker → hold → checkout → confirmation.
//
// These cover the three things that would be expensive to get wrong and
// that types cannot catch: a dead link in the booking funnel, a second
// identity minted per club member, and money that doesn't add up.

const CLUB_COMPONENTS = path.join(__dirname, "..", "components", "club");
const CLUB_APP = path.join(__dirname, "..", "app", "(club)");
const APP_DIR = path.join(__dirname, "..", "app");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

function internalLinks(source: string): string[] {
  const links = new Set<string>();
  for (const m of source.matchAll(/href=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
    const raw = m[1] ?? m[2] ?? "";
    if (raw.startsWith("/") && !raw.startsWith("//")) links.add(raw.split("?")[0].split("#")[0]);
  }
  return [...links];
}

function routeExists(urlPath: string): boolean {
  const segments = urlPath.split("/").filter(Boolean);
  const search = (dir: string, remaining: string[]): boolean => {
    if (!fs.existsSync(dir)) return false;
    if (remaining.length === 0) {
      return ["page.tsx", "page.ts", "route.ts"].some((f) => fs.existsSync(path.join(dir, f)));
    }
    const [head, ...tail] = remaining;
    const entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const e of entries) {
      if (e.name.startsWith("(") && e.name.endsWith(")")) {
        if (search(path.join(dir, e.name), remaining)) return true;
      }
    }
    for (const e of entries) {
      const isDynamic = e.name.startsWith("[") && e.name.endsWith("]");
      const isTemplateSegment = head.includes("${");
      const nameMatches = isTemplateSegment ? isDynamic : e.name === head || isDynamic;
      if (nameMatches && search(path.join(dir, e.name), tail)) return true;
    }
    return false;
  };
  return search(APP_DIR, segments);
}

/** Club surfaces are served from the ROOT of a club host: middleware
 * rewrites /coaches/<id> into the /club/coaches/<id> route group, so a link
 * resolves if EITHER form exists. Shared paths (/login, /privacy) are only
 * ever at their real location, which the first check covers. */
function resolvesOnClubHost(urlPath: string): boolean {
  // "/" on a club host serves the deck (rewritten to /club/browse); every
  // other clean path maps into the route group unchanged.
  return routeExists(urlPath) || routeExists(urlPath === "/" ? "/club/browse" : `/club${urlPath}`);
}

describe("club links resolve to real routes", () => {
  const files = [...walk(CLUB_COMPONENTS), ...walk(CLUB_APP)].filter((f) => f.endsWith(".tsx"));

  it("finds club files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [path.relative(path.join(__dirname, ".."), f), f]))(
    "%s has no dead links",
    (_name, file) => {
      const dead = internalLinks(fs.readFileSync(file, "utf-8")).filter((l) => !resolvesOnClubHost(l));
      expect(dead).toEqual([]);
    }
  );

  it("every step of the booking funnel exists, as a visitor types it", () => {
    // The clean URLs a visitor actually sees on tistra.club.
    for (const route of ["/", "/browse", "/coaches/x", "/coaches/x/book", "/checkout/x", "/bookings", "/bookings/x", "/profile"]) {
      expect([route, resolvesOnClubHost(route)]).toEqual([route, true]);
    }
  });

  it("can actually fail", () => {
    expect(resolvesOnClubHost("/not-a-real-route")).toBe(false);
    expect(routeExists("/club/not-a-real-route")).toBe(false);
  });
});

describe("club members reuse one identity", () => {
  // The marketplace spec forbids duplicate user records where an existing
  // Tistra account can be reused, and the product intent is that a free
  // (booking) account and a paid (nutrition) account are the same person.
  // Scoping club emails the way "adults" is scoped would mint a second
  // Supabase user for every club member.
  it("does not tag club sign-ins", () => {
    expect(scopedEmail("person@example.com", "club")).toBe("person@example.com");
  });

  it("shares the base identity with the coach surface", () => {
    expect(scopedEmail("person@example.com", "club")).toBe(scopedEmail("person@example.com", "gym"));
  });

  it("leaves the adults scoping untouched", () => {
    expect(scopedEmail("person@example.com", "adults")).toBe("person+nutriai-adults@example.com");
  });

  it("routes club sign-in through the club surface, not adults", () => {
    // A club visitor landing on /login must not be treated as an adults
    // signup — that is what silently creates the +nutriai-adults duplicate.
    const login = fs.readFileSync(path.join(__dirname, "..", "app", "(public)", "login", "page.tsx"), "utf-8");
    const signup = fs.readFileSync(path.join(__dirname, "..", "app", "(public)", "signup", "page.tsx"), "utf-8");
    for (const src of [login, signup]) {
      expect(src).toContain("resolveAuthSurface");
      // Host detection lives in the shared isClubHost helper.
      expect(src).toContain("isClubHost");
    }
  });
});

describe("marketplace money is exact", () => {
  it.each([0, 1, 99, 4500, 7000, 12345, 999_999])(
    "gross %i splits without losing a cent",
    (gross) => {
      const { platformFeeCents, coachAmountCents } = splitAmount(gross, DEFAULT_PLATFORM_FEE_PERCENT);
      expect(platformFeeCents + coachAmountCents).toBe(gross);
      expect(Number.isInteger(platformFeeCents)).toBe(true);
      expect(Number.isInteger(coachAmountCents)).toBe(true);
      expect(platformFeeCents).toBeGreaterThanOrEqual(0);
      expect(coachAmountCents).toBeGreaterThanOrEqual(0);
    }
  );

  it("never stores card data in the payments layer", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "lib", "club", "payments.ts"), "utf-8");
    // Comments legitimately mention card handling; code must not.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const forbidden of ["card_number", "cardNumber", "cvc", "cvv", "expiryMonth"]) {
      expect(code).not.toContain(forbidden);
    }
  });
});

describe("club sign-in lands somewhere sensible", () => {
  // A club visitor signing in on club.tistrahealth.com should land on "/",
  // which middleware rewrites to discovery — sending them to "/club" there
  // only puts the internal prefix in the address bar. On any other host
  // "/" is the Tistra Health homepage, so "/club" is required.
  const login = fs.readFileSync(path.join(__dirname, "..", "app", "(public)", "login", "page.tsx"), "utf-8");
  const signup = fs.readFileSync(path.join(__dirname, "..", "app", "(public)", "signup", "page.tsx"), "utf-8");

  it.each([["login", login], ["signup", signup]])("%s picks the destination from the host", (_n, src) => {
    expect(src).toContain("defaultNextFor");
    // Host detection moved into the shared isClubHost helper when
    // tistra.club was added — see club-hosts.test.ts.
    expect(src).toMatch(/isClubHost\(hostname\)/);
  });

  it.each([["login", login], ["signup", signup]])("%s no longer hardcodes /club", (_n, src) => {
    expect(src).not.toMatch(/product === "club" \? "\/club"/);
  });

  it("the OAuth callback returns to the host it left from", () => {
    // The club OAuth failure (Aug 2026) was a Supabase allow-list gap, not
    // this route — but if the callback ever built its redirect from a
    // configured site URL instead of the request origin, every subdomain
    // would silently funnel back to the apex.
    const callback = fs.readFileSync(path.join(__dirname, "..", "app", "auth", "callback", "route.ts"), "utf-8");
    expect(callback).toMatch(/const \{ searchParams, origin \} = new URL\(request\.url\)/);
    expect(callback).toMatch(/NextResponse\.redirect\(`\$\{origin\}\$\{next\}`\)/);
    expect(callback).not.toMatch(/NEXT_PUBLIC_SITE_URL/);
  });
});
