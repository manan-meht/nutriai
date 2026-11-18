// The app's copy of the web's Guidance aggregation (lib/guidance-aggregation.ts).
// Imported by relative path, not "@/", because the root jest config maps
// "@/" to the WEB app's src.
import { readFileSync } from "fs";
import { join } from "path";

import { compare, nutrientStats, periodFor, summarizeDays } from "../lib/guidance-aggregation";
import type { DailyTotals, GuidanceDay, NutrientDay } from "../lib/guidance-types";

const REPO = join(__dirname, "..", "..", "..", "..");

/** The file's code with its header comment and import lines set aside. */
function body(source: string): string {
  const lines = source.split("\n");
  const firstImport = lines.findIndex((l) => l.startsWith("import "));
  return lines
    .slice(firstImport)
    .filter((l) => !l.startsWith("import "))
    .join("\n");
}

describe("guidance-aggregation copy", () => {
  it("matches the web's src/lib/guidance/aggregation.ts apart from the header and imports", () => {
    const web = readFileSync(join(REPO, "src", "lib", "guidance", "aggregation.ts"), "utf8");
    const app = readFileSync(join(REPO, "apps", "mobile", "src", "lib", "guidance-aggregation.ts"), "utf8");
    expect(body(app)).toBe(body(web));
  });

  it("says it mirrors the web file and must be kept in sync", () => {
    const app = readFileSync(join(REPO, "apps", "mobile", "src", "lib", "guidance-aggregation.ts"), "utf8");
    expect(app.slice(0, 600)).toMatch(/Mirrors the web app's src\/lib\/guidance\/aggregation\.ts/);
    expect(app.slice(0, 600)).toMatch(/kept in sync/);
  });
});

const nutrient = (consumed: number, target: number, isIncomplete = false): NutrientDay => ({
  target,
  consumed,
  remaining: Math.max(0, target - consumed),
  over: Math.max(0, consumed - target),
  isIncomplete,
  mealsMissingData: isIncomplete ? 1 : 0,
});

function day(date: string, mealCount: number, protein: number, opts: { proteinIncomplete?: boolean } = {}): GuidanceDay {
  const totals: DailyTotals = {
    date,
    mealCount,
    calories: nutrient(protein * 20, 1800),
    protein: nutrient(protein, 90, opts.proteinIncomplete),
    carbs: nutrient(200, 220),
    fat: nutrient(50, 60),
    fiber: nutrient(20, 28),
    hasIncompleteData: !!opts.proteinIncomplete,
  };
  return { date, loggedAt: `${date}T12:00:00`, totals };
}

describe("aggregation through the app's copy", () => {
  it("starts the week on Monday and the comparison on the full week before", () => {
    // 11 November 2026 is a Wednesday.
    const p = periodFor("week", "2026-11-11");
    expect(p).toMatchObject({ start: "2026-11-09", end: "2026-11-11", lastDay: "2026-11-15" });
    expect(p.previous).toEqual({ start: "2026-11-02", end: "2026-11-08" });
  });

  it("keeps unlogged, partial and in-progress days out of the average", () => {
    const days = summarizeDays(
      [
        day("2026-11-11", 1, 30), // today: in progress
        day("2026-11-10", 3, 80),
        day("2026-11-09", 0, 0), // nothing logged: not a zero
        day("2026-11-08", 2, 40), // two of three meals: partial
        day("2026-11-07", 3, 100),
        day("2026-11-06", 3, 60, { proteinIncomplete: true }),
      ],
      "2026-11-11",
      3
    );
    expect(days.map((d) => d.status)).toEqual(["in_progress", "complete", "unlogged", "partial", "complete", "complete"]);
    const stats = nutrientStats(days, "protein");
    expect(stats.usableDays).toBe(2);
    expect(stats.average).toBe(90);
    // The complete day missing a protein estimate counts as partial for protein.
    expect(stats.counts).toEqual({ complete: 2, partial: 2, unlogged: 1, in_progress: 1 });
  });

  it("counts a confirmed skip toward the usual number of meals", () => {
    const [d] = summarizeDays([day("2026-11-10", 2, 70)], "2026-11-11", 3, [{ date: "2026-11-10" }]);
    expect(d).toMatchObject({ status: "complete", skipped: 1 });
  });

  it("won't compare with fewer than three usable days on either side", () => {
    const current = nutrientStats(summarizeDays([day("2026-11-10", 3, 80)], "2026-11-11", 3), "protein");
    const previous = nutrientStats(
      summarizeDays([day("2026-11-03", 3, 60), day("2026-11-04", 3, 60), day("2026-11-05", 3, 60)], "2026-11-11", 3),
      "protein"
    );
    expect(compare(current, previous)).toEqual({ kind: "insufficient", currentDays: 1, previousDays: 3, required: 3 });
  });
});
