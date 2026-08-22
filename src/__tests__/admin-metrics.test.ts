import fs from "fs";
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

  it("counts users as tracked people, not auth accounts", () => {
    // profiles also holds coaches and staff — 85 rows against 35 real
    // Tistra Health users.
    const t = code(ROUTE);
    expect(t).toMatch(/\.from\("adults_contacts"\)[\s\S]{0,120}deleted_at/);
    expect(t).not.toMatch(/from\("profiles"\)/);
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
