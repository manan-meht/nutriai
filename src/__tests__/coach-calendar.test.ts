import fs from "fs";
import path from "path";

// Google Calendar free/busy for a coach.
//
// The privacy guarantee is structural, not procedural: the scope requested
// is free/busy, so Google never sends event titles, attendees or locations
// in the first place. The spec's rule ("clients must NEVER see meeting
// titles, attendees, descriptions") is satisfied by never receiving them.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
const lib = () => src("lib/club/calendar.ts");
const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("only busy times are ever requested", () => {
  it("asks for the free/busy scope and nothing wider", () => {
    expect(lib()).toMatch(/auth\/calendar\.freebusy/);
    for (const wider of ["calendar.readonly", "auth/calendar\"", "calendar.events"]) {
      expect([wider, code(lib()).includes(wider)]).toEqual([wider, false]);
    }
  });

  it("uses the freeBusy endpoint, not events.list", () => {
    expect(lib()).toMatch(/calendar\/v3\/freeBusy/);
    expect(code(lib())).not.toMatch(/calendar\/v3\/calendars\/[^/]*\/events/);
  });

  it("maps the response to times only", () => {
    // start/end and nothing else — there is no field here that could
    // carry a title even if Google sent one.
    expect(lib()).toMatch(/busy\.map\(\(b\) => \(\{ startsAt: new Date\(b\.start\), endsAt: new Date\(b\.end\) \}\)\)/);
  });

  it("requests offline access so the connection outlives an hour", () => {
    expect(lib()).toMatch(/access_type: "offline"/);
    expect(lib()).toMatch(/prompt: "consent"/);
  });
});

describe("unknown is never treated as free", () => {
  it("returns null, not [], when there is no usable connection", () => {
    // [] means "connected and genuinely free"; null means "we don't know".
    // Conflating them double-books the coach, which is the whole reason
    // this integration exists.
    const fn = lib().slice(lib().indexOf("export async function fetchBusyBlocks"));
    expect(fn).toMatch(/if \(!calendarConfigured\(\)\) return null;/);
    expect(fn).toMatch(/if \(!token\) return null;/);
    expect(fn).toMatch(/if \(!res\.ok\) return null;/);
  });

  it("a failed refresh marks the connection, rather than passing silently", () => {
    expect(lib()).toMatch(/markNeedsReauth/);
    expect(lib()).toMatch(/sync_status: "needs_reauth"/);
  });

  it("the slot query adds calendar busy to Tistra's own busy blocks", () => {
    const d = src("lib/club/discovery.ts");
    expect(d).toMatch(/const externalBusy = await fetchBusyBlocks\(/);
    expect(d).toMatch(/\.\.\.\(externalBusy \?\? \[\]\)/);
  });
});

describe("tokens at rest", () => {
  const crypto_ = () => src("lib/club/calendar-crypto.ts");

  it("are encrypted before they touch the database", () => {
    expect(lib()).toMatch(/access_token_encrypted: await encryptToken\(/);
    expect(lib()).toMatch(/refresh_token_encrypted: await encryptToken\(/);
  });

  it("use AES-GCM with a random IV per value", () => {
    expect(crypto_()).toMatch(/name: "AES-GCM"/);
    expect(crypto_()).toMatch(/crypto\.getRandomValues\(new Uint8Array\(IV_BYTES\)\)/);
  });

  it("fail closed on a rotated key rather than throwing", () => {
    // A rotated key should mean "reconnect", not a 500 on a settings page.
    expect(crypto_()).toMatch(/return null;\s*\n\s*\}\s*\n\}/);
  });

  it("keeps an existing refresh token when Google omits one", () => {
    // Google only returns it on first consent; overwriting with undefined
    // would downgrade a working connection to a one-hour one.
    expect(lib()).toMatch(/tokens\.refresh_token\s*\n?\s*\?\s*\{ refresh_token_encrypted/);
  });

  it("deletes the row on disconnect instead of keeping credentials", () => {
    expect(lib()).toMatch(/\.from\("calendar_connections"\)\s*\n?\s*\.delete\(\)/);
  });
});

describe("the OAuth callback cannot be forged", () => {
  const cb = () => src("app/api/coach/calendar/callback/route.ts");

  it("requires a signed-in coach whose id matches the state", () => {
    expect(cb()).toMatch(/coach\.id !== coachProfileId/);
  });

  it("checks the nonce this server parked", () => {
    expect(cb()).toMatch(/pending\?\.last_error !== `pending:\$\{nonce\}`/);
  });

  it("never puts Google's error text in a redirect URL", () => {
    expect(code(cb())).not.toMatch(/error=\$\{/);
  });
});

describe("what the coach is told", () => {
  it("states the guarantee plainly in settings", () => {
    const ui = src("components/coach/CalendarSection.tsx");
    expect(ui).toMatch(/busy times/);
    expect(ui).toMatch(/never event names, guests or locations/);
  });

  it("surfaces a broken connection instead of hiding it", () => {
    expect(src("components/coach/CalendarSection.tsx")).toMatch(/Reconnect needed/);
  });
});

describe("the prompt appears where a coach is thinking about their week", () => {
  const section = () => src("components/coach/CalendarSection.tsx");
  const page = () => src("app/(coach)/coach/calendar/page.tsx");

  it("the calendar page renders the same component, compact", () => {
    // One component, two densities — status wording and the privacy
    // promise cannot drift between the two places they appear.
    expect(page()).toMatch(/<CalendarSection state=\{calendar\} compact \/>/);
    expect(page()).toMatch(/getCalendarState\(admin, profile\.id\)/);
  });

  it("says nothing once connected", () => {
    // A healthy integration has no message to add to a calendar view.
    expect(section()).toMatch(/if \(!state\.configured \|\| state\.status === "connected"\) return null;/);
  });

  it("offers reconnect when access lapsed, connect otherwise", () => {
    const compact = section().slice(section().indexOf("if (compact)"), section().indexOf("return (\n    <section"));
    expect(compact).toMatch(/state\.status === "needs_reauth" \? "Reconnect" : "Connect Google Calendar"/);
  });

  it("repeats the busy-times-only promise where the coach is asked to connect", () => {
    const compact = section().slice(section().indexOf("if (compact)"), section().indexOf("return (\n    <section"));
    expect(compact).toMatch(/busy times/);
  });
});
