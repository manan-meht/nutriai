import fs from "fs";
import { percentChange } from "@/lib/admin/metrics-math";
import path from "path";

// The admin dashboard's metrics feed.
//
// It reported confident nonsense in both directions. Health counted
// meal_images, meals and workspace_members — tables that exist but have
// never held a row, so every figure read 0 and nothing errored, because an
// empty table is not a query error. Club counted the 11 seeded demo
// coaches and the two Stripe TEST-mode payments taken through the test
// coach account, reporting S$140 of play money as revenue.
//
// These assertions are about WHICH SOURCE each number comes from. A metric
// reading the wrong table is the failure mode here, and it is silent.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
const code = (p: string) => src(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const ROUTE = "app/api/admin/metrics/route.ts";

describe("metrics read the tables the app actually writes", () => {
  it("counts meals and photos from meal_logs", () => {
    const t = code(ROUTE);
    expect(t).toMatch(/\.from\("meal_logs"\)/);
    expect(t).toMatch(/\.not\("image_url", "is", null\)/);
  });

  it("never reads the three empty legacy tables again", () => {
    const t = code(ROUTE);
    for (const dead of ["meal_images", '"meals"', "workspace_members"]) {
      expect(t).not.toContain(dead);
    }
  });

  it("dates a photo by when it arrived, not when the meal was eaten", () => {
    // logged_at is user-supplied and drifts when someone back-dates a meal.
    expect(code(ROUTE)).toMatch(/\.gte\("created_at", since\)/);
    expect(code(ROUTE)).not.toMatch(/gte\("logged_at"/);
  });

  it("separates accounts from the people they track", () => {
    // These were the same number under two labels: totalUsers counted
    // adults_contacts, so "total users" and the contact total could never
    // disagree even though one account commonly adds several contacts.
    const t = code(ROUTE);
    // Users = distinct workspace owners, so holding a self AND a family
    // workspace is still one person.
    expect(t).toMatch(/from\("workspaces"\)[\s\S]{0,120}owner_id/);
    expect(t).toMatch(/eq\("type", "adults"\)/);
    // profiles also holds coaches and staff, so it is still never the source.
    expect(t).not.toMatch(/from\("profiles"\)/);
  });

  it("counts contacts from the tracked-people table, excluding removals", () => {
    const t = code(ROUTE);
    expect(t).toMatch(/\.from\("adults_contacts"\)[\s\S]{0,160}deleted_at/);
    // A removed contact is not someone being tracked; counting them would
    // make the total drift upward forever.
    expect(t).toMatch(/is\("deleted_at", null\)/);
  });

  it("reports contacts over the same windows as everything else", () => {
    const t = code(ROUTE);
    for (const k of ["contacts7d", "contacts30d", "contactsTotal"]) {
      expect(t).toContain(k);
    }
  });

  it("reports total AND active users, so active is readable as a share", () => {
    const t = code(ROUTE);
    expect(t).toMatch(/activeUsersTotal/);
    expect(t).toMatch(/totalUsers/);
    expect(t).toMatch(/activeUsers7d/);
    expect(t).toMatch(/activeUsers30d/);
  });
});

describe("club metrics exclude demo and test data", () => {
  it("scopes every club figure to real coaches", () => {
    const t = code(ROUTE);
    expect(t).toMatch(/\.eq\("is_demo", false\)/);
    // Bookings and payments filter by the resolved real-coach ids, which is
    // what keeps the test-mode payments out: they sit on the test coach
    // account, and that account is flagged is_demo.
    expect(t.match(/\.in\("coach_profile_id", coachIds\)/g)?.length).toBe(2);
  });

  it("does not count a draft profile as an onboarded coach", () => {
    expect(code(ROUTE)).toMatch(/\.neq\("status", "draft"\)/);
  });

  it("handles having no real coaches without erroring", () => {
    // An .in() against an empty array is a PostgREST error, not an empty
    // result — that would have taken the whole dashboard down on the day
    // before the first coach signed up.
    expect(code(ROUTE)).toMatch(/if \(coachIds\.length === 0\)/);
  });

  it("sums revenue only from succeeded payments", () => {
    expect(code(ROUTE)).toMatch(/\.eq\("status", "succeeded"\)/);
  });
});

describe("a broken metric fails loudly", () => {
  it("throws on a query error rather than reporting zero", () => {
    const t = code(ROUTE);
    expect(t.match(/throw new Error\(/g)?.length).toBeGreaterThanOrEqual(5);
    expect(t).toMatch(/status: 500/);
  });
});

describe("percentage change against the previous window", () => {
  it("reports growth and decline", () => {
    expect(percentChange(82, 40)).toBe(105);
    expect(percentChange(40, 80)).toBe(-50);
  });

  it("reports no change as zero, not null", () => {
    // Flat is a real, useful answer — distinct from "cannot say".
    expect(percentChange(8, 8)).toBe(0);
  });

  it("refuses to invent a percentage out of an empty window", () => {
    // Growth from zero is either infinity or an arbitrary 100%, and both
    // read as real movement on a dashboard. The caller has to handle it.
    expect(percentChange(4, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });

  it("handles a window falling to zero", () => {
    expect(percentChange(0, 20)).toBe(-100);
  });

  it("rounds to whole percent", () => {
    expect(percentChange(7, 3)).toBe(133);
    expect(Number.isInteger(percentChange(7, 3))).toBe(true);
  });
});

describe("comparison windows", () => {
  const t = code(ROUTE);

  it("compares against an equal-length window, not since-the-beginning", () => {
    // 7d is measured against days 8-14, and 30d against days 31-60.
    expect(t).toMatch(/daysAgoIso\(14\)/);
    expect(t).toMatch(/daysAgoIso\(60\)/);
  });

  it("closes the previous window where the current one opens", () => {
    // Half-open, so a row on the boundary is not counted in both.
    expect(t).toMatch(/until: since7d/);
    expect(t).toMatch(/until: since30d/);
    expect(t).toMatch(/\.lt\("created_at", window\.until\)/);
  });
});

describe("top photo submitters", () => {
  const t = code(ROUTE);

  it("returns counts, never the photos themselves", () => {
    // A metrics dashboard has no business rendering real meal photos.
    expect(t).toMatch(/interface TopSubmitter[\s\S]{0,80}photos: number/);
    expect(t).not.toMatch(/topPhotoSubmitters[\s\S]{0,400}select\("[^"]*image_url[^"]*"\)/);
  });

  it("counts only rows that actually carry a photo", () => {
    expect(t).toMatch(/topPhotoSubmitters[\s\S]{0,600}not\("image_url", "is", null\)/);
  });

  it("keeps a submitter whose contact row has since been removed", () => {
    // Their meal_logs survive the soft delete; dropping them would make the
    // table disagree with the photo count above it.
    expect(t).toMatch(/\|\| "Unknown"/);
  });

  it("is ordered by volume and capped", () => {
    expect(t).toMatch(/sort\(\(a, b\) => b\[1\] - a\[1\]\)/);
    expect(t).toMatch(/slice\(0, limit\)/);
  });
});

describe("the team's own accounts are excluded", () => {
  const t = code(ROUTE);

  it("filters Health figures on an explicit flag, not an email pattern", () => {
    // Matching '%manan%' would silently reclassify a genuine customer who
    // happens to share a name, and the count would just quietly drop.
    expect(t).toMatch(/eq\("is_test", true\)/);
    expect(t).not.toMatch(/email/i);
  });

  it("excludes them from users, contacts, photos and submitters alike", () => {
    // A flag applied to only some figures is worse than none: the totals
    // stop reconciling with each other.
    expect(t).toMatch(/eq\("type", "adults"\)[\s\S]{0,80}eq\("is_test", false\)/);
    const excludes = t.match(/not\("workspace_id", "in", testIdList\(testIds\)\)/g) ?? [];
    expect(excludes.length).toBe(4); // photos, active users, contacts, submitters
  });

  it("skips the filter when nothing is flagged", () => {
    // PostgREST renders an empty list as `in.()` and rejects it as a syntax
    // error rather than reading it as "exclude nothing" — the same trap the
    // club metrics hit with an empty coach list.
    const guards = t.match(/testIds\.length > 0/g) ?? [];
    expect(guards.length).toBe(4);
  });

  it("reads the flag once and threads it through", () => {
    // Re-querying per metric would be 17 extra round trips for a value that
    // cannot change mid-request.
    expect(t).toMatch(/const testIds = await testWorkspaceIds\(db\)/);
    expect((t.match(/await testWorkspaceIds\(db\)/g) ?? []).length).toBe(1);
  });
});
