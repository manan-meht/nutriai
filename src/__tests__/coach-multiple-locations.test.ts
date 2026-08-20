import fs from "fs";
import path from "path";

// A coach may work from more than one place. The schema always allowed it;
// the form edited only the primary row, so a second studio was
// unreachable.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
const settings = () => src("components/coach/CoachSettings.tsx");
const actions = () => src("app/(coach)/coach/actions.ts");
const page = () => src("app/(coach)/coach/settings/page.tsx");

describe("the form handles a list", () => {
  it("loads every active location, primary first", () => {
    expect(page()).toMatch(/\.eq\("is_active", true\)\s*\n?\s*\.order\("is_primary", \{ ascending: false \}\)/);
    expect(settings()).toMatch(/locations: SettingsData\["locations"\]/);
  });

  it("keeps one editor open at a time", () => {
    // Each editor carries a Google map; mounting several would load the
    // Maps API for places the coach isn't editing.
    expect(settings()).toMatch(/const \[editingId, setEditingId\]/);
    expect(settings()).toMatch(/key=\{editingId \?\? "new"\}/);
  });

  it("gives all three row actions the same clickable affordance", () => {
    // "Edit" had an underline and the other two were plain coloured text,
    // so "Make main" read as a label rather than a control.
    const rows = settings().slice(settings().indexOf("locations.map((loc)"), settings().indexOf("{rowError &&"));
    expect((rows.match(/className=\{ROW_ACTION\}/g) ?? []).length).toBe(3);
    expect(settings()).toMatch(/const ROW_ACTION =/);
    expect(settings()).toMatch(/focus-visible:outline-2/);
  });

  it("offers add, edit, make main and remove", () => {
    expect(settings()).toMatch(/\+ Add another location/);
    expect(settings()).toMatch(/setPrimaryCoachLocation\(loc\.id\)/);
    expect(settings()).toMatch(/deleteCoachLocation\(loc\.id\)/);
  });

  it("the first location saved becomes the main one", () => {
    expect(settings()).toMatch(/isPrimary: draft\.isPrimary \|\| locations\.length === 0/);
  });
});

describe("exactly one primary", () => {
  it("unsets the others before setting the new one", () => {
    // The column has no constraint enforcing a single primary, and two
    // would make "where do you coach" answer arbitrarily.
    const fn = actions().slice(actions().indexOf("export async function setPrimaryCoachLocation"));
    expect(fn).toMatch(/\.update\(\{ is_primary: false \}\)\s*\n?\s*\.eq\("coach_profile_id", coach\.id\)/);
    expect(fn).toMatch(/\.update\(\{ is_primary: true/);
  });

  it("promotes another location when the primary is deleted", () => {
    const fn = actions().slice(actions().indexOf("export async function deleteCoachLocation"));
    expect(fn).toMatch(/if \(wasPrimary\)/);
    expect(fn).toMatch(/\.update\(\{ is_primary: true \}\)/);
  });
});

describe("deletion protects someone other than the coach", () => {
  const fn = () => actions().slice(actions().indexOf("export async function deleteCoachLocation"));

  it("refuses to remove the only location", () => {
    // "Add where you coach" is a publish blocker, so deleting the last one
    // would silently unpublish a live profile from a screen that says
    // nothing about publishing.
    expect(fn()).toMatch(/locations\.length <= 1/);
    expect(fn()).toMatch(/This is your only location/);
  });

  it("refuses to remove a location with upcoming sessions", () => {
    // booking_locations references it ON DELETE SET NULL, so the booking
    // survives while losing the exact address promised on confirmation.
    expect(fn()).toMatch(/\.gte\("bookings\.starts_at", new Date\(\)\.toISOString\(\)\)/);
    expect(fn()).toMatch(/upcoming \$\{n === 1 \? "session is" : "sessions are"\} booked/);
  });

  it("scopes every write to the signed-in coach", () => {
    expect(fn()).toMatch(/\.eq\("coach_profile_id", coach\.id\)/);
  });
});

describe("the publish blocker still counts locations", () => {
  it("uses length, not truthiness of the array", () => {
    // An empty array is truthy: !!locations.data would let a coach with no
    // location clear the blocker.
    expect(page()).toMatch(/hasLocation: \(locations\.data \?\? \[\]\)\.length > 0/);
  });
});
