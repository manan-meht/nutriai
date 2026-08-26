import { execSync } from "child_process";

let mockCoachRows: { id: string; updated_at: string | null }[] = [];
let mockThrows = false;

jest.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: async () => {
            if (mockThrows) throw new Error("db down");
            return { data: mockCoachRows };
          },
        }),
      }),
    }),
  }),
}));

import { llmsTxtForHost, HEALTH_LLMS_TXT, CLUB_LLMS_TXT, COACH_LLMS_TXT } from "@/lib/seo/llms-txt";
import { clubMarketplaceGraph, coachProfileGraph, CLUB_URL } from "@/lib/seo/club-structured-data";
import { CLUB_FAQ } from "@/lib/seo/club-faq";
import { siteForHost, originFor, sitemapEntriesFor, COACH_URL } from "@/lib/seo/site-routes";

type Node = Record<string, any>;

// ---------------------------------------------------------------- llms.txt

describe("llms.txt is resolved per host", () => {
  it.each([
    ["tistrahealth.com", "# Tistra Health"],
    ["www.tistrahealth.com", "# Tistra Health"],
    ["family.tistrahealth.com", "# Tistra Health"],
    ["tistra.club", "# Tistra Club"],
    ["www.tistra.club", "# Tistra Club"],
    ["coach.tistra.club", "# Tistra Coach"],
    ["coach.tistrahealth.com", "# Tistra Coach"],
  ])("%s serves %s", (host, heading) => {
    expect(llmsTxtForHost(host).split("\n")[0]).toBe(heading);
  });

  it("falls back to Health for an unknown or missing host", () => {
    expect(llmsTxtForHost(null).split("\n")[0]).toBe("# Tistra Health");
    expect(llmsTxtForHost("localhost:3001").split("\n")[0]).toBe("# Tistra Health");
  });

  it("strips the port before matching", () => {
    expect(llmsTxtForHost("tistra.club:3001").split("\n")[0]).toBe("# Tistra Club");
  });

  it("still serves the Health document that was reviewed and committed", () => {
    // The document moved out of public/llms.txt into a TS template literal.
    // This proves the move was lossless rather than a silent re-typing.
    const committed = execSync("git show aa69963:public/llms.txt", { encoding: "utf-8" });
    expect(HEALTH_LLMS_TXT.trim()).toBe(committed.trim());
  });

  it.each([
    ["club", CLUB_LLMS_TXT],
    ["coach", COACH_LLMS_TXT],
  ])("the %s document follows the spec shape", (_name, doc) => {
    expect(doc.startsWith("# Tistra ")).toBe(true);
    expect(doc).toMatch(/\n> /); // blockquote summary
    expect(doc).toMatch(/\n## /); // at least one section
  });

  it("escapes survived the template literal — no stray backslashes", () => {
    // The club document contains backticks around a URL pattern. If the
    // escaping were wrong they would arrive as \` in the served text.
    expect(CLUB_LLMS_TXT).toContain("`https://tistra.club/coaches/<id>`");
    expect(CLUB_LLMS_TXT).not.toContain("\\`");
  });

  it("states the market limit and what the club is not", () => {
    expect(CLUB_LLMS_TXT).toMatch(/## Trust and limits/);
    expect(CLUB_LLMS_TXT).toMatch(/Singapore only/);
    expect(CLUB_LLMS_TXT).toMatch(/[Nn]ot a medical or rehabilitation service/);
  });

  it("does not describe Tistra Health as the club's own product", () => {
    const beforeRelated = CLUB_LLMS_TXT.split("## Related products")[0];
    expect(beforeRelated).not.toMatch(/nutrition tracking/i);
  });
});

// ------------------------------------------------------- marketplace graph

describe("club marketplace graph", () => {
  const coaches = [
    { coachProfileId: "a", displayName: "Real One", headline: null, neighbourhood: "CBD", skills: ["Yoga"], startingPriceCents: 8000, currency: "SGD", ratingAverage: null, reviewCount: 0 },
    { coachProfileId: "b", displayName: "Seeded", headline: null, neighbourhood: null, skills: [], startingPriceCents: null, currency: "SGD", ratingAverage: 4.9, reviewCount: 12, isDemo: true },
  ];
  const nodes = (includeFaq = false) =>
    (clubMarketplaceGraph(`${CLUB_URL}/coaches`, coaches, includeFaq) as { "@graph": Node[] })["@graph"];
  const byType = (t: string, f = false) => nodes(f).find((n) => n["@type"] === t);

  it("serialises without cycles or undefined", () => {
    const json = JSON.stringify(clubMarketplaceGraph(`${CLUB_URL}/coaches`, coaches, true));
    expect(json).not.toMatch(/undefined/);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("excludes demo coaches from the ItemList", () => {
    const list = (byType("CollectionPage") as Node).mainEntity;
    expect(list.numberOfItems).toBe(1);
    expect(list.itemListElement).toHaveLength(1);
    expect(list.itemListElement[0].name).toBe("Real One");
    expect(JSON.stringify(list)).not.toMatch(/Seeded/);
  });

  it("omits mainEntity entirely when every coach is a demo", () => {
    const demoOnly = clubMarketplaceGraph(`${CLUB_URL}/coaches`, [{ ...coaches[1] }]) as { "@graph": Node[] };
    const page = demoOnly["@graph"].find((n) => n["@type"] === "CollectionPage") as Node;
    expect(page.mainEntity).toBeUndefined();
  });

  it("links every ListItem to a canonical club URL", () => {
    const list = (byType("CollectionPage") as Node).mainEntity;
    for (const item of list.itemListElement) {
      expect(item.url.startsWith(`${CLUB_URL}/coaches/`)).toBe(true);
    }
  });

  it("only claims FAQPage when asked", () => {
    expect(byType("FAQPage")).toBeUndefined();
    expect(byType("FAQPage", true)).toBeDefined();
    expect((byType("FAQPage", true) as Node).mainEntity).toHaveLength(CLUB_FAQ.length);
  });

  it("says Singapore, not a generic area", () => {
    const org = byType("Organization") as Node;
    expect(org.areaServed).toEqual({ "@type": "Country", name: "Singapore" });
  });

  it("carries no Tistra Health entity", () => {
    expect(JSON.stringify(nodes(true))).not.toMatch(/tistrahealth\.com/);
  });
});

// ----------------------------------------------------------- coach profile

describe("coach profile graph", () => {
  const base = {
    coachProfileId: "c1",
    displayName: "Felicia Ong",
    headline: "Inline skating coach",
    neighbourhood: "Serangoon",
    skills: ["Inline Skating"],
    startingPriceCents: 6000,
    currency: "SGD",
    ratingAverage: null,
    reviewCount: 0,
    bio: "Teaches adults to skate.",
    yearsCoaching: 5,
    languages: ["English"],
    photoUrl: "https://example.test/p.jpg",
    cancellationFullRefundHours: 24,
    services: [
      { name: "inline skating", description: null, durationMinutes: 60, priceCents: 6000, currency: "SGD", travelEnabled: true },
    ],
  };
  const url = `${CLUB_URL}/coaches/c1`;
  const graph = (over: Partial<typeof base> = {}) =>
    coachProfileGraph({ ...base, ...over }, url) as { "@graph": Node[] } | null;
  const node = (t: string, over: Partial<typeof base> = {}) =>
    graph(over)!["@graph"].find((n) => n["@type"] === t) as Node;

  it("emits nothing at all for a demo profile", () => {
    // A seeded example has an invented name, rating and price. Publishing
    // that as Person + Offer is a fabricated listing.
    expect(graph({ isDemo: true } as any)).toBeNull();
  });

  it("describes the coach as a Person with their skills", () => {
    const p = node("Person");
    expect(p.name).toBe("Felicia Ong");
    expect(p.knowsAbout).toEqual(["Inline Skating"]);
    expect(p.areaServed.name).toBe("Serangoon, Singapore");
  });

  it("omits aggregateRating when there are no reviews", () => {
    expect(node("Person").aggregateRating).toBeUndefined();
  });

  it("includes aggregateRating only once reviews exist", () => {
    const p = node("Person", { ratingAverage: 4.8, reviewCount: 6 });
    expect(p.aggregateRating).toMatchObject({ ratingValue: 4.8, reviewCount: 6 });
  });

  it("prices each service as a decimal string with a currency", () => {
    const svc = node("Service");
    expect(svc.offers.price).toBe("60.00");
    expect(svc.offers.priceCurrency).toBe("SGD");
    expect(svc.offers.eligibleDuration).toMatchObject({ value: 60, unitCode: "MIN" });
  });

  it("marks a travelling service with its own channel", () => {
    expect(node("Service").availableChannel.name).toMatch(/travels to the client/i);
  });

  it("every service points back at the coach", () => {
    const g = graph()!["@graph"];
    const personId = (g.find((n) => n["@type"] === "Person") as Node)["@id"];
    for (const s of g.filter((n) => n["@type"] === "Service")) {
      expect(s.provider["@id"]).toBe(personId);
    }
  });

  it("uses the canonical club origin, never a request host", () => {
    expect(JSON.stringify(graph())).not.toMatch(/localhost|vercel|workers\.dev/);
  });

  it("serialises cleanly", () => {
    expect(() => JSON.parse(JSON.stringify(graph()))).not.toThrow();
  });
});

// ------------------------------------------------------- robots + sitemap

describe("host-aware robots and sitemap", () => {
  it.each([
    ["tistrahealth.com", "health"],
    ["tistra.club", "club"],
    ["www.tistra.club", "club"],
    ["coach.tistra.club", "coach"],
    ["coach.tistrahealth.com", "coach"],
    ["localhost:3001", "health"],
  ])("%s resolves to the %s site", (host, kind) => {
    expect(siteForHost(host)).toBe(kind);
  });

  it("each site points at its own origin", () => {
    expect(originFor("club")).toBe(CLUB_URL);
    expect(originFor("coach")).toBe(COACH_URL);
    expect(originFor("health")).toBe("https://tistrahealth.com");
  });

  it("a sitemap never lists another site's URLs", async () => {
    for (const site of ["health", "club", "coach"] as const) {
      mockCoachRows = [];
      const entries = await sitemapEntriesFor(site);
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) expect(e.url.startsWith(originFor(site))).toBe(true);
    }
  });

  it("the club sitemap includes published coach profiles", async () => {
    mockCoachRows = [
      { id: "aaa", updated_at: "2026-08-25T00:00:00Z" },
      { id: "bbb", updated_at: null },
    ];
    const urls = (await sitemapEntriesFor("club")).map((e) => e.url);
    expect(urls).toContain(`${CLUB_URL}/coaches/aaa`);
    expect(urls).toContain(`${CLUB_URL}/coaches/bbb`);
    expect(urls).toContain(`${CLUB_URL}/coaches`);
  });

  it("still returns the static routes when the coach query fails", async () => {
    mockThrows = true;
    const entries = await sitemapEntriesFor("club");
    mockThrows = false;
    // A sitemap missing its dynamic half beats a sitemap that 500s.
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map((e) => e.url)).toContain(`${CLUB_URL}/coaches`);
  });

  it("the health sitemap lists /pricing, which the old one missed", async () => {
    const urls = (await sitemapEntriesFor("health")).map((e) => e.url);
    expect(urls).toContain("https://tistrahealth.com/pricing");
  });
});

// ------------------------------------------------------------- FAQ content

describe("club FAQ is shaped for extraction", () => {
  it.each(CLUB_FAQ.map((e) => [e.question, e] as const))("%s has a usable summary", (_q, entry) => {
    expect(entry.question.trim().endsWith("?")).toBe(true);
    expect(entry.tldr.length).toBeGreaterThan(60);
    expect(entry.tldr.length).toBeLessThan(320);
    expect((entry.tldr.match(/[.!?](\s|$)/g) ?? []).length).toBeLessThanOrEqual(2);
    expect(entry.tldr).not.toMatch(/^(It|They|This|That|These|Those)\b/);
  });

  it("covers the money, location and cancellation questions people actually ask", () => {
    const qs = CLUB_FAQ.map((e) => e.question.toLowerCase()).join(" ");
    expect(qs).toMatch(/how much/);
    expect(qs).toMatch(/come to my home/);
    expect(qs).toMatch(/cancel/);
    expect(qs).toMatch(/singapore/);
  });

  it("names Singapore in most answers, since that is the whole scope", () => {
    const named = CLUB_FAQ.filter((e) => /singapore/i.test(e.tldr + e.detail)).length;
    expect(named).toBeGreaterThanOrEqual(CLUB_FAQ.length / 2);
  });
});

describe("the club FAQ section is machine-readable", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs
    .readFileSync(path.join(__dirname, "..", "components", "club", "ClubFaq.tsx"), "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("renders on the server with no animation wrapper", () => {
    expect(src).not.toMatch(/^"use client"/m);
    expect(src).not.toMatch(/<Reveal/);
  });

  it("puts each question in its own heading", () => {
    expect(src).toMatch(/<h3[\s\S]*?\{entry\.question\}/);
  });
});
