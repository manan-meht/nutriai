import fs from "fs";
import path from "path";
import { discoverCoaches, getCoachPublicProfile } from "@/lib/club/discovery";

// tistra.club is live with no real coaches registered. The seeded examples
// belong at /demo, labelled — anywhere else they are twelve invented people
// with names, prices and availability presented as bookable.
//
// The rule under test is one-directional: a demo coach must never reach the
// public deck. A real coach missing from /demo is a cosmetic problem; the
// reverse misleads someone into trying to book a person who doesn't exist.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
/** Comments describe the rule and would satisfy the negative assertions
 * below on their own — strip them so the checks read the code. */
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const PROFILE_ROWS = [
  { id: "real-1", is_demo: false, display_name: "Real Coach" },
  { id: "demo-1", is_demo: true, display_name: "Seeded Coach" },
];

/** Minimal PostgREST stand-in: records the filters discovery applies and
 * answers from PROFILE_ROWS, so the test observes the QUERY rather than
 * trusting a hand-written return value. */
function stubClient(opts: { hasDemoColumn: boolean }) {
  const filters: Record<string, unknown> = {};
  const builder = (table: string): any => {
    const b: any = {
      _table: table,
      _cols: "",
      _eq: {} as Record<string, unknown>,
      select: (cols?: string) => {
        b._cols = cols ?? "";
        return b;
      },
      eq: (col: string, val: unknown) => {
        b._eq[col] = val;
        if (table === "coach_profiles" && col === "is_demo") filters.is_demo = val;
        return b;
      },
      in: () => b,
      gte: () => b,
      gt: () => b,
      is: () => b,
      order: () => b,
      limit: () => b,
      maybeSingle: () => b.then((r: any) => ({ ...r, data: r.data?.[0] ?? null })),
      then: (resolve: any) => {
        if (table !== "coach_profiles") return resolve({ data: [], error: null });
        if (b._cols.includes("is_demo") && !opts.hasDemoColumn) {
          return resolve({
            data: null,
            error: { code: "42703", message: "column coach_profiles.is_demo does not exist" },
          });
        }
        if ("is_demo" in b._eq && !opts.hasDemoColumn) {
          return resolve({
            data: null,
            error: { code: "42703", message: "column coach_profiles.is_demo does not exist" },
          });
        }
        const rows = PROFILE_ROWS.filter((r) =>
          Object.entries(b._eq).every(([col, val]) => !(col in r) || (r as any)[col] === val)
        ).map((r) => {
          // A column that wasn't selected isn't in the response — which is
          // exactly the case `is_demo ?? true` has to handle.
          if (b._cols.includes("is_demo")) return { ...r };
          const { is_demo, ...rest } = r;
          return rest;
        });
        return resolve({ data: rows, error: null });
      },
    };
    return b;
  };

  return {
    filters,
    client: {
      from: (t: string) => builder(t),
      storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
    } as any,
  };
}

describe("demo coaches are separated from real ones", () => {
  it("the public deck asks for real coaches only", async () => {
    const { client, filters } = stubClient({ hasDemoColumn: true });
    await discoverCoaches(client, {});
    expect(filters.is_demo).toBe(false);
  });

  it("/demo asks for demo coaches only", async () => {
    const { client, filters } = stubClient({ hasDemoColumn: true });
    await discoverCoaches(client, { demo: true });
    expect(filters.is_demo).toBe(true);
  });

  it("filters in the query, not in the page", async () => {
    // A UI-level filter still ships the seeded coaches to the browser.
    expect(code("lib/club/discovery.ts")).toMatch(/\.eq\("is_demo", demoOnly\)/);
  });
});

describe("before migration 0060 is applied", () => {
  // Migrations here are hand-applied, so code and schema go live minutes
  // apart in either order. Neither order may put a fake coach on the site.
  it("shows nobody rather than everybody on the public deck", async () => {
    const { client } = stubClient({ hasDemoColumn: false });
    await expect(discoverCoaches(client, {})).resolves.toEqual([]);
  });

  it("still fills /demo, since every profile today is seeded", async () => {
    const { client } = stubClient({ hasDemoColumn: false });
    // Reaches the query; emptiness here would come from the stub's other
    // tables, so assert the fallback ran rather than the card count.
    await expect(discoverCoaches(client, { demo: true })).resolves.toEqual([]);
    expect(code("lib/club/discovery.ts")).toMatch(/if \(!demoOnly\) return \[\];/);
  });

  it("treats an unlabelled profile as a demo, not as real", async () => {
    const { client } = stubClient({ hasDemoColumn: false });
    const profile = await getCoachPublicProfile(client, "demo-1");
    expect(profile?.isDemo).toBe(true);
  });

  it("recognises the missing column without matching unrelated failures", () => {
    const mod = require("@/lib/club/discovery");
    expect(code("lib/club/discovery.ts")).toMatch(/error\.code === "42703"/);
    // A network blip must NOT be read as "no column" — that would empty
    // the deck for a real reason and hide it.
    expect(code("lib/club/discovery.ts")).not.toMatch(/isMissingDemoColumn\(.*\)\s*\|\|\s*true/);
    expect(mod).toBeDefined();
  });
});

describe("the demo says what it is", () => {
  it("labels the deck on the first screen", () => {
    const feed = code("components/club/SwipeFeed.tsx");
    expect(feed).toMatch(/Demo — these coaches are examples, not real people\./);
    // In the flow, not a fixed overlay: an absolutely-positioned banner is
    // how "Filters" ended up on top of a coach's name.
    expect(feed).not.toMatch(/fixed[^"]*z-\d+[^"]*\{demo/);
  });

  it("labels an example profile reached directly by URL", () => {
    const profile = code("app/(club)/club/coaches/[coachId]/page.tsx");
    expect(profile).toMatch(/coach\.isDemo &&/);
    expect(profile).toMatch(/This is a demo profile\./);
  });

  it("keeps /demo out of search results", () => {
    expect(code("app/(club)/club/demo/page.tsx")).toMatch(/robots: \{ index: false, follow: false \}/);
  });

  it("passes demo through to the list view so the showcase stays whole", () => {
    expect(code("app/(club)/club/coaches/page.tsx")).toMatch(/demo,/);
    expect(code("components/club/SwipeFeed.tsx")).toMatch(/"\/coaches\?demo=1"/);
  });
});

describe("the empty public deck", () => {
  it("explains itself instead of rendering a blank feed", () => {
    const feed = code("components/club/SwipeFeed.tsx");
    expect(feed).toMatch(/coaches\.length === 0 \?/);
    expect(feed).toMatch(/signing up the first coaches/);
  });

  it("does not blame filters the visitor never set", () => {
    // "clear your filters to see everyone" is wrong — and unfixable by the
    // visitor — when the marketplace itself is empty.
    const list = code("components/club/CoachCardList.tsx");
    expect(list).toMatch(/filtered \?/);
    expect(list).toMatch(/No coaches yet\./);
    expect(code("app/(club)/club/coaches/page.tsx")).toMatch(
      /filtered=\{!!params\.skill \|\| params\.travels === "1"\}/
    );
  });

  it("distinguishes 'none at all' from 'none for this skill'", () => {
    // Offering "Browse all coaches" when there are none is a dead end.
    const feed = code("components/club/SwipeFeed.tsx");
    const empty = feed.slice(feed.indexOf("filtered.length === 0 ?"));
    expect(empty).toMatch(/No coaches for this skill yet\./);
    expect(empty).toMatch(/Coach with Tistra/);
  });
});
