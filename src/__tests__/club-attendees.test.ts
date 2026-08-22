import fs from "fs";
import path from "path";
import { attendeeProblem, ageFrom, attendeeSummary, RELATIONSHIP_SUGGESTIONS } from "@/lib/club/attendees";

// Booking for someone else. Most attendees here are children, so the
// design point is that an attendee is NOT an account: they never log in,
// never pay, never get messaged. The booker stays the payer.

describe("adding someone to book for", () => {
  it("needs a name", () => {
    expect(attendeeProblem({ fullName: "" })).toMatch(/Enter a name/);
    expect(attendeeProblem({ fullName: "   " })).toMatch(/Enter a name/);
    expect(attendeeProblem({ fullName: "Maya" })).toBeNull();
  });

  it("rejects a date of birth in the future", () => {
    const next = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    expect(attendeeProblem({ fullName: "Maya", dateOfBirth: next })).toMatch(/in the future/);
  });

  it("treats date of birth as optional", () => {
    expect(attendeeProblem({ fullName: "Maya", dateOfBirth: null })).toBeNull();
  });

  it("offers relationships as suggestions, not a closed list", () => {
    // The column is free text: "grandson" and "training partner" are real
    // answers and not ours to refuse.
    expect(RELATIONSHIP_SUGGESTIONS).toContain("Other");
    expect(attendeeProblem({ fullName: "Maya", relationship: "Grandson" })).toBeNull();
  });
});

describe("age", () => {
  const now = new Date("2026-08-22T00:00:00.000Z");

  it("counts whole years", () => {
    expect(ageFrom("2016-08-22", now)).toBe(10);
    expect(ageFrom("2016-08-21", now)).toBe(10);
  });

  it("does not round up before the birthday", () => {
    expect(ageFrom("2016-08-23", now)).toBe(9);
    expect(ageFrom("2016-12-01", now)).toBe(9);
  });

  it("is null when not given, rather than guessed", () => {
    expect(ageFrom(null, now)).toBeNull();
    expect(ageFrom("not-a-date", now)).toBeNull();
  });
});

describe("what the coach is shown", () => {
  it("names the attendee, with age when it was offered", () => {
    const now = new Date("2026-08-22T00:00:00.000Z");
    expect(attendeeSummary({ fullName: "Maya Tan", dateOfBirth: "2016-01-04" }, now)).toBe("Maya Tan (10)");
    expect(attendeeSummary({ fullName: "Maya Tan", dateOfBirth: null }, now)).toBe("Maya Tan");
  });

  it("does not tell the coach the relationship", () => {
    // Whether she is a daughter or a niece is the client's business; the
    // coach needs to know who to expect, not the family structure.
    const src = fs.readFileSync(path.join(__dirname, "..", "lib/club/attendees.ts"), "utf-8");
    const fn = src.slice(src.indexOf("export function attendeeSummary"));
    expect(fn).not.toMatch(/relationship/);
  });
});

describe("an attendee is not a user", () => {
  const src = () => fs.readFileSync(path.join(__dirname, "..", "lib/club/attendees.ts"), "utf-8");
  /** Line comments first: a "//" line containing "/*" would otherwise open
   * a block comment and swallow real code. The prose explains the rule and
   * would satisfy these negative checks on its own. */
  const code = () =>
    src().replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  it("has no auth, contact details or notification path", () => {
    const t = code();
    for (const forbidden of ["auth", "password", "whatsapp", "phone", "email"]) {
      expect(t.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("is scoped to the client who created them", () => {
    expect(src()).toMatch(/\.eq\("client_profile_id", clientProfileId\)/);
  });

  it("is soft-deleted, so past bookings keep their attendee", () => {
    expect(src()).toMatch(/\.is\("deleted_at", null\)/);
  });
});

describe("the new tables are not reachable by a browser key", () => {
  const migration = () =>
    fs.readFileSync(
      path.join(__dirname, "..", "..", "supabase/migrations/0061_attendees_and_class_packs.sql"),
      "utf-8"
    );

  it("enables RLS on every table it creates", () => {
    // Same posture as the rest of the club schema: RLS on, no policies, so
    // only the service-role client can touch these. club_attendees holds
    // children's names and dates of birth; club_pack_purchases is a wallet,
    // and a writable classes_used would let anyone spend someone else's
    // credits.
    const sql = migration();
    const created = [...sql.matchAll(/create table if not exists (\w+)/g)].map((m) => m[1]);
    expect(created.length).toBeGreaterThan(0);
    for (const table of created) {
      expect(sql).toContain(`alter table ${table} enable row level security`);
    }
  });

  it("grants nothing back with a policy", () => {
    expect(migration()).not.toMatch(/create policy/);
  });
});

describe("the booking keeps its own record of who attended", () => {
  it("snapshots the name alongside the id", () => {
    // Same reason price and cancellation terms are snapshotted: who
    // attended is a fact about that session and must survive a rename or
    // a deletion.
    const migration = fs.readFileSync(
      path.join(__dirname, "..", "..", "supabase/migrations/0061_attendees_and_class_packs.sql"),
      "utf-8"
    );
    expect(migration).toMatch(/add column if not exists attendee_id uuid references club_attendees\(id\) on delete set null/);
    expect(migration).toMatch(/add column if not exists attendee_name text/);
  });
});
