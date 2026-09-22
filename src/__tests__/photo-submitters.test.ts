import fs from "fs";
import path from "path";
import { summarisePhotoSubmitters, type MealRowForSubmitters } from "@/lib/admin/photo-submitters";
import { canSeeSubmitterIdentity } from "@/lib/admin/auth";

const row = (over: Partial<MealRowForSubmitters> & { personId: string; loggedAt: string }): MealRowForSubmitters => ({
  hasPhoto: true,
  ...over,
});

describe("counting photo submitters", () => {
  it("counts photos per person, most first", () => {
    const totals = summarisePhotoSubmitters([
      row({ personId: "a", loggedAt: "2026-09-01T08:00:00Z" }),
      row({ personId: "b", loggedAt: "2026-09-01T09:00:00Z" }),
      row({ personId: "a", loggedAt: "2026-09-02T08:00:00Z" }),
      row({ personId: "a", loggedAt: "2026-09-03T08:00:00Z" }),
    ]);
    expect(totals.submitters.map((s) => [s.personId, s.photoCount])).toEqual([
      ["a", 3],
      ["b", 1],
    ]);
    expect(totals.totalPhotos).toBe(4);
    expect(totals.totalSubmitters).toBe(2);
  });

  it("leaves out people who have only ever logged by text", () => {
    const totals = summarisePhotoSubmitters([
      row({ personId: "texter", loggedAt: "2026-09-01T08:00:00Z", hasPhoto: false }),
      row({ personId: "texter", loggedAt: "2026-09-02T08:00:00Z", hasPhoto: false }),
      row({ personId: "shooter", loggedAt: "2026-09-01T08:00:00Z" }),
    ]);
    expect(totals.submitters.map((s) => s.personId)).toEqual(["shooter"]);
  });

  it("still counts a submitter's text-only meals toward their meal total", () => {
    const [only] = summarisePhotoSubmitters([
      row({ personId: "a", loggedAt: "2026-09-01T08:00:00Z" }),
      row({ personId: "a", loggedAt: "2026-09-01T13:00:00Z", hasPhoto: false }),
    ]).submitters;
    // The gap between the two is the point: it says how much of someone's
    // logging actually arrives as a photo.
    expect(only.photoCount).toBe(1);
    expect(only.mealCount).toBe(2);
  });

  it("records the first and last photo, not the first and last meal", () => {
    const [only] = summarisePhotoSubmitters([
      row({ personId: "a", loggedAt: "2026-01-01T08:00:00Z", hasPhoto: false }),
      row({ personId: "a", loggedAt: "2026-05-01T08:00:00Z" }),
      row({ personId: "a", loggedAt: "2026-06-01T08:00:00Z" }),
      row({ personId: "a", loggedAt: "2026-12-01T08:00:00Z", hasPhoto: false }),
    ]).submitters;
    expect(only.firstPhotoAt).toBe("2026-05-01T08:00:00Z");
    expect(only.lastPhotoAt).toBe("2026-06-01T08:00:00Z");
  });

  describe("active days", () => {
    it("counts a day once however many photos it holds", () => {
      const [only] = summarisePhotoSubmitters([
        row({ personId: "a", loggedAt: "2026-09-01T08:00:00Z", timezone: "Asia/Kolkata" }),
        row({ personId: "a", loggedAt: "2026-09-01T13:00:00Z", timezone: "Asia/Kolkata" }),
        row({ personId: "a", loggedAt: "2026-09-02T08:00:00Z", timezone: "Asia/Kolkata" }),
      ]).submitters;
      expect(only.photoCount).toBe(3);
      expect(only.activeDays).toBe(2);
    });

    it("uses the person's own timezone, not UTC", () => {
      // 17:00 and 20:00 UTC are 1am and 4am the NEXT day in Singapore — one
      // UTC day, but two of the person's days. Counting in UTC would report
      // a single active day and understate how regularly they log.
      const rows = [
        row({ personId: "sg", loggedAt: "2026-09-01T17:00:00Z", timezone: "Asia/Singapore" }),
        row({ personId: "sg", loggedAt: "2026-09-02T20:00:00Z", timezone: "Asia/Singapore" }),
      ];
      expect(summarisePhotoSubmitters(rows).submitters[0].activeDays).toBe(2);
    });

    it("survives a timezone the runtime does not recognise", () => {
      const [only] = summarisePhotoSubmitters([
        row({ personId: "a", loggedAt: "2026-09-01T08:00:00Z", timezone: "Mars/Olympus_Mons" }),
      ]).submitters;
      // The row must still be counted rather than dropped.
      expect(only.photoCount).toBe(1);
      expect(only.activeDays).toBe(1);
    });
  });

  it("breaks a tie on the most recently active", () => {
    const totals = summarisePhotoSubmitters([
      row({ personId: "dormant", loggedAt: "2026-01-01T08:00:00Z" }),
      row({ personId: "live", loggedAt: "2026-09-01T08:00:00Z" }),
    ]);
    expect(totals.submitters.map((s) => s.personId)).toEqual(["live", "dormant"]);
  });

  it("takes the median, so one heavy user does not define a typical one", () => {
    const rows: MealRowForSubmitters[] = [];
    for (let i = 0; i < 200; i++) rows.push(row({ personId: "heavy", loggedAt: `2026-09-01T08:00:${String(i % 60).padStart(2, "0")}Z` }));
    for (const p of ["a", "b", "c", "d"]) rows.push(row({ personId: p, loggedAt: "2026-09-01T08:00:00Z" }));
    const totals = summarisePhotoSubmitters(rows);
    expect(totals.medianPhotos).toBe(1);
  });

  it("ignores rows with no person or no timestamp", () => {
    const totals = summarisePhotoSubmitters([
      row({ personId: "", loggedAt: "2026-09-01T08:00:00Z" }),
      { personId: "a", loggedAt: "", hasPhoto: true },
      row({ personId: "a", loggedAt: "2026-09-01T08:00:00Z" }),
    ]);
    expect(totals.totalSubmitters).toBe(1);
    expect(totals.totalPhotos).toBe(1);
  });

  it("handles having no meals at all", () => {
    const totals = summarisePhotoSubmitters([]);
    expect(totals).toEqual({ submitters: [], totalPhotos: 0, totalSubmitters: 0, medianPhotos: 0 });
  });
});

describe("who may see real names", () => {
  it("keeps reviewers on the anonymised ids the queue already uses", () => {
    expect(canSeeSubmitterIdentity("reviewer")).toBe(false);
    expect(canSeeSubmitterIdentity("nutrition_expert")).toBe(false);
  });

  it("shows names to admins", () => {
    expect(canSeeSubmitterIdentity("admin")).toBe(true);
    expect(canSeeSubmitterIdentity("super_admin")).toBe(true);
  });
});

describe("the action reads every page of meal_logs", () => {
  it("pages rather than trusting one request", () => {
    // PostgREST caps a response at 1000 rows and does not say that it
    // truncated. meal_logs passed 800 during this feature's first week, so
    // a single unpaged select would have started under-counting silently.
    const src = fs.readFileSync(path.join(__dirname, "..", "app/(admin)/admin/actions.ts"), "utf-8");
    const fn = src.slice(src.indexOf("export async function getPhotoSubmitters"));
    expect(fn).toMatch(/\.range\(from, from \+ MEAL_PAGE_SIZE - 1\)/);
    expect(fn).toMatch(/if \(!data \|\| data\.length < MEAL_PAGE_SIZE\) break;/);
  });
});
