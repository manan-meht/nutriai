import fs from "fs";
import path from "path";
import { zonedDateString, zonedWeekday } from "@/lib/club/time";
import { CLUB_MARKET } from "@/lib/club/config";

// The coach calendar week, in the coach's own clock.
//
// It used to mix three: the day key came from UTC, busy blocks were grouped
// by the SERVER's local date, and the grid positions everything in
// Singapore time. On a UTC Worker those agree for most of the day and
// diverge for the eight hours that matter — a busy block or session between
// 00:00 and 06:00 SGT was filed under the previous day and drawn above the
// top of the grid, so it silently disappeared.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
const code = (p: string) => src(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const QUERIES = "lib/club/coach-queries.ts";
const GRID = "components/coach/CoachCalendar.tsx";
const PAGE = "app/(coach)/coach/calendar/page.tsx";

describe("a Singapore early morning belongs to the Singapore day", () => {
  const tz = CLUB_MARKET.timezone;

  it("01:00 SGT is the NEXT day in UTC terms — the case that broke", () => {
    // 2026-08-21T17:00Z is 2026-08-22 01:00 in Singapore.
    const instant = new Date("2026-08-21T17:00:00.000Z");
    expect(instant.toISOString().slice(0, 10)).toBe("2026-08-21"); // what it used to key on
    expect(zonedDateString(instant, tz)).toBe("2026-08-22"); // what the coach would say
  });

  it("groups by market date, not by UTC or the server's locale", () => {
    const q = code(QUERIES);
    expect(q).toMatch(/zonedDateString\(b\.startsAt, tz\) === dayKey/);
    expect(q).toMatch(/zonedDateString\(new Date\(s\.startsAt\), tz\) === dayKey/);
    // The three original offenders must be gone.
    expect(q).not.toMatch(/getTimezoneOffset\(\)/);
    expect(q).not.toMatch(/date\.toISOString\(\)\.slice\(0, 10\)/);
    expect(q).not.toMatch(/s\.startsAt\.slice\(0, 10\)/);
  });

  it("reads the weekday in market time, so working hours match the column", () => {
    expect(code(QUERIES)).toMatch(/zonedWeekday\(zonedTimeToInstant\(dayKey, 12 \* 60, tz\), tz\)/);
    // A Sunday 23:00 SGT instant is still Monday in UTC.
    const instant = new Date("2026-08-23T15:00:00.000Z"); // Sun 23:00 SGT
    expect(zonedWeekday(instant, tz)).toBe(0);
    expect(instant.getUTCDay()).toBe(0);
  });

  it("starts the week at market midnight, not the server's", () => {
    // setHours() gave the Worker's midnight = 08:00 SGT, so Monday's first
    // eight hours fell outside the week entirely.
    const page = code(PAGE);
    expect(page).toMatch(/zonedTimeToInstant\(dayKey, 0, tz\)/);
    expect(page).not.toMatch(/setHours\(0, 0, 0, 0\)/);
  });

  it("highlights today by the market date", () => {
    const grid = code(GRID);
    expect(grid).toMatch(/const todayKey = zonedDateString\(new Date\(\), CLUB_MARKET\.timezone\)/);
    expect(grid).not.toMatch(/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
  });
});

describe("nothing falls off the edge of the grid", () => {
  it("widens the window to fit early and late entries", () => {
    const grid = code(GRID);
    expect(grid).toMatch(/function visibleWindow/);
    expect(grid).toMatch(/const \{ start: dayStartMinute, end: dayEndMinute \} = visibleWindow\(week\)/);
    // The fixed constants that clipped anything outside 06:00-22:00.
    expect(grid).not.toMatch(/const VISIBLE_MINUTES =/);
  });

  it("clamps a block that runs past the window instead of inverting it", () => {
    // A block ending after midnight reports a smaller end-minute than its
    // start; unclamped that produced a negative height.
    const grid = code(GRID);
    expect(grid).toMatch(/const span = \(from: number, to: number\)/);
    expect(grid).toMatch(/Math\.max\(0, Math\.min\(to, dayEndMinute\) - Math\.max\(from, dayStartMinute\)\)/);
  });

  it("reports the window it is actually showing", () => {
    expect(code(GRID)).toMatch(/Showing \{Math\.floor\(dayStartMinute \/ 60\)\}/);
  });
});

describe("the connected calendar is named even without an email", () => {
  it("does not hide the confirmation when the address is unknown", () => {
    // calendar.freebusy grants no access to the user's email, so it is
    // normally null — the line used to vanish entirely, leaving a connected
    // coach with no confirmation.
    const section = code("components/coach/CalendarSection.tsx");
    expect(section).toMatch(/state\.email \?\? "your Google Calendar"/);
    expect(section).toMatch(/\(state\.status === "connected" \|\| state\.email\)/);
  });

  it("does not widen the scope to obtain it", () => {
    const cal = code("lib/club/calendar.ts");
    expect(cal).toMatch(/const SCOPE = "https:\/\/www\.googleapis\.com\/auth\/calendar\.freebusy"/);
    expect(cal).not.toMatch(/userinfo\.email|auth\/calendar\.readonly|openid/);
  });
});

describe("the privacy policy discloses the Google Calendar data", () => {
  // Google will not verify an app requesting a Calendar scope unless the
  // policy says what is accessed, why, how it is stored and shared, and how
  // to revoke it — and carries the Limited Use sentence.
  const policy = () => src("app/(public)/privacy/content.ts");

  it("carries the Limited Use sentence Google looks for", () => {
    expect(policy()).toMatch(
      /adheres to the Google API Services User Data Policy, including the Limited Use requirements/
    );
    expect(policy()).toMatch(/developers\.google\.com\/terms\/api-services-user-data-policy/);
  });

  it("names the exact scope and what it excludes", () => {
    const t = policy();
    expect(t).toMatch(/calendar\.freebusy/);
    expect(t).toMatch(/does not give Tistra access to event titles/);
  });

  it("states storage, sharing and revocation", () => {
    const t = policy();
    expect(t).toMatch(/encrypted before being stored/);
    expect(t).toMatch(/never used to train AI models/);
    expect(t).toMatch(/deletes the stored tokens immediately/);
  });

  it("matches what the code actually requests — the claim must stay true", () => {
    // If the scope is ever widened, this policy becomes a false statement.
    const cal = src("lib/club/calendar.ts");
    expect(cal).toContain('"https://www.googleapis.com/auth/calendar.freebusy"');
    expect(policy()).toMatch(/a single Google permission/);
  });

  it("bumps the last-updated date, which reviewers check for staleness", () => {
    expect(policy()).toMatch(/PRIVACY_LAST_UPDATED = "August 24, 2026"/);
  });
});
