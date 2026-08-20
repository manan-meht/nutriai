import fs from "fs";
import path from "path";

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
const settings = () => src("components/coach/CoachSettings.tsx");
const actions = () => src("app/(coach)/coach/actions.ts");
const page = () => src("app/(coach)/coach/settings/page.tsx");

// Time off and languages: two gaps where the backend was already complete
// and only the form was missing — one of which meant the public profile
// stated something no coach could correct.

describe("time off", () => {
  it("has a section that reaches the existing actions", () => {
    expect(settings()).toMatch(/function TimeOffSection/);
    expect(settings()).toMatch(/addAvailabilityException\(\{ startsAt, endsAt, type: "blocked", reason \}\)/);
    expect(settings()).toMatch(/removeAvailabilityException\(e\.id\)/);
  });

  it("blocks whole days in the market's timezone", () => {
    // Picking 5-7 means all three days off, not 00:00 to 00:00.
    expect(settings()).toMatch(/T00:00:00\+08:00/);
    expect(settings()).toMatch(/T23:59:59\+08:00/);
  });

  it("refuses to block time that already has sessions in it", () => {
    // The booking would survive but sit outside availability — nobody is
    // told, and the coach may not notice until someone turns up.
    const fn = actions().slice(actions().indexOf("export async function addAvailabilityException"));
    expect(fn).toMatch(/\.in\("status", \["CONFIRMED", "PAYMENT_PENDING"\]\)/);
    expect(fn).toMatch(/\.lt\("starts_at", input\.endsAt\)/);
    expect(fn).toMatch(/\.gt\("ends_at", input\.startsAt\)/);
    expect(fn).toMatch(/You have a session booked on/);
  });

  it("names the clashing session rather than refusing vaguely", () => {
    const fn = actions().slice(actions().indexOf("export async function addAvailabilityException"));
    expect(fn).toMatch(/and \$\{clashes\.length - 1\} more/);
  });

  it("lists only upcoming closures", () => {
    // Past time off is history a coach cannot act on.
    expect(page()).toMatch(/\.gte\("ends_at", new Date\(\)\.toISOString\(\)\)/);
  });

  it("still leaves the weekly grid alone", () => {
    expect(settings()).toMatch(/Your weekly hours stay as they are/);
  });
});

describe("languages", () => {
  it("are editable, having only ever been displayed", () => {
    // The public profile always rendered a Languages line; the action
    // defaulted everyone to English and nothing could change it.
    expect(settings()).toMatch(/function LanguagesField/);
    expect(settings()).toMatch(/languages: form\.languages/);
    expect(page()).toMatch(/languages: Array\.isArray\(coach\.languages\)/);
  });

  it("offers languages a Singapore coach would actually use", () => {
    for (const l of ["English", "Mandarin", "Malay", "Tamil"]) {
      expect(settings()).toContain(`"${l}"`);
    }
  });

  it("are toggles with aria-pressed, not a free-text field", () => {
    const field = settings().slice(settings().indexOf("function LanguagesField"));
    expect(field).toMatch(/aria-pressed=\{on\}/);
  });

  it("can never be saved empty", () => {
    // The public profile renders whatever is here; none at all reads as a
    // bug rather than a choice.
    expect(settings()).toMatch(/next\.length > 0 \? next : \["English"\]/);
  });
});
