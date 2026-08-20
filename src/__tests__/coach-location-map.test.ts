import fs from "fs";
import path from "path";
import { matchKnownNeighbourhood, MARKET_CENTRE } from "@/lib/club/geocode";
import { SG_NEIGHBOURHOODS } from "@/lib/club/config";

// "Where you coach" now captures real coordinates, from GPS or a dropped
// pin, plus the radius a coach will travel.
//
// Coordinates are not cosmetic: the availability engine needs them to tell
// whether a coach can physically reach a client between sessions, and it
// refuses to guess when travel time is unknown. Before this, a coach could
// only pick a neighbourhood name, so that check had nothing to work with.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

describe("reverse geocoding maps onto known neighbourhoods", () => {
  it("matches exactly, ignoring case", () => {
    expect(matchKnownNeighbourhood("tiong bahru")).toBe("Tiong Bahru");
  });

  it("matches when the provider is more specific than we are", () => {
    expect(matchKnownNeighbourhood("Tiong Bahru Estate")).toBe("Tiong Bahru");
  });

  it("returns null rather than inventing a neighbourhood", () => {
    // The value is what clients see and what discovery filters on, so a
    // free-text guess would break filtering silently.
    expect(matchKnownNeighbourhood("Somewhere Else Entirely")).toBeNull();
    expect(matchKnownNeighbourhood("")).toBeNull();
    expect(matchKnownNeighbourhood(null)).toBeNull();
  });

  it("only ever returns a value from the known list", () => {
    for (const probe of ["orchard", "CBD", "novena road", "unknown place"]) {
      const match = matchKnownNeighbourhood(probe);
      if (match !== null) expect(SG_NEIGHBOURHOODS).toContain(match);
    }
  });

  it("opens the map on the market centre", () => {
    expect(MARKET_CENTRE.latitude).toBeGreaterThan(1);
    expect(MARKET_CENTRE.latitude).toBeLessThan(2);
    expect(MARKET_CENTRE.longitude).toBeGreaterThan(103);
    expect(MARKET_CENTRE.longitude).toBeLessThan(105);
  });
});

describe("the geocode endpoint is guarded", () => {
  const route = src("app/api/coach/geocode/route.ts");

  it("requires a signed-in user, so our rate limit isn't public", () => {
    expect(route).toMatch(/supabase\.auth\.getUser\(\)/);
    expect(route).toMatch(/401/);
  });

  it("validates coordinates before calling out", () => {
    expect(route).toMatch(/Number\.isFinite/);
    expect(route).toMatch(/lat < -90 \|\| lat > 90/);
  });
});

describe("coordinates survive a save", () => {
  const settings = src("components/coach/CoachSettings.tsx");

  it("are passed to the action", () => {
    expect(settings).toMatch(/latitude: form\.latitude \?\? undefined/);
    expect(settings).toMatch(/longitude: form\.longitude \?\? undefined/);
  });

  it("send undefined rather than null when unpinned", () => {
    // Sending null would wipe an existing pin whenever a coach saved the
    // rest of the form without touching the map.
    expect(settings).not.toMatch(/latitude: form\.latitude \?\? null/);
  });

  it("are loaded back into the form", () => {
    expect(src("app/(coach)/coach/settings/page.tsx")).toMatch(/latitude: locations\.data\.latitude/);
  });
});

describe("map provider and key handling", () => {
  const map = src("components/coach/CoachLocationMap.tsx");

  it("waits for importLibrary rather than the script's onload", () => {
    // Under loading=async the bootstrap defines importLibrary() and
    // nothing else, so touching google.maps.Map when onload fires throws
    // "Map is not a constructor". Awaiting importLibrary is what actually
    // guarantees the classes exist.
    expect(map).toMatch(/importLibrary\("maps"\)/);
    // Marker has moved between libraries across Maps versions; asking the
    // wrong one yields undefined and fails later as "not a constructor".
    expect(map).toMatch(/maps\.Marker \?\? g\(\)\.maps\.Marker/);
  });

  it("loads the Maps JS API once, even if asked twice", () => {
    // A second <script> tag makes Google warn and reinitialise.
    expect(map).toMatch(/let mapsPromise/);
    expect(map).toMatch(/if \(mapsPromise\) return mapsPromise/);
  });

  it("lets a failed load be retried rather than caching the failure", () => {
    expect(map).toMatch(/mapsPromise = null;/);
  });

  it("uses only the browser key client-side, never the server key", () => {
    // The server key can call Places and Geocoding and must never ship.
    expect(map).toMatch(/NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY/);
    expect(map).not.toMatch(/GOOGLE_MAPS_SERVER_KEY/);
  });

  it("degrades to the address field when the map cannot load", () => {
    expect(map).toMatch(/couldn&rsquo;t load/);
    // Naming the cause matters: "it failed" leaves a coach with nothing
    // to act on, and the two causes have different fixes.
    expect(map).toMatch(/"no-key"/);
    expect(map).toMatch(/"blocked"/);
  });

  it("keeps the pin private to the coach", () => {
    expect(map).toMatch(/clients only ever see your neighbourhood/i);
  });
});

describe("address search", () => {
  const search = src("components/coach/AddressSearch.tsx");

  it("debounces and sets a minimum length", () => {
    // Places searchText is billed per request, so an undebounced field
    // turns typing one address into a dozen charges.
    expect(search).toMatch(/setTimeout\(/);
    expect(search).toMatch(/\}, 600\);/);
    expect(search).toMatch(/q\.length < MIN_SEARCH_LENGTH/);
  });

  it("caches identical searches so backspacing is free", () => {
    const g = src("lib/club/geocode.ts");
    expect(g).toMatch(/readCache\(cacheKey\)/);
    expect(g).toMatch(/writeCache\(cacheKey, results\)/);
    expect(g).toMatch(/CACHE_TTL_MS/);
  });

  it("bounds the cache so it cannot grow without limit", () => {
    const g = src("lib/club/geocode.ts");
    expect(g).toMatch(/CACHE_MAX_ENTRIES/);
    expect(g).toMatch(/cache\.delete\(oldest\)/);
  });

  it("discards a stale response instead of rendering it", () => {
    // A slow early request landing after a fast later one would repopulate
    // the list for a prefix the coach has already typed past.
    expect(search).toMatch(/requestId/);
    expect(search).toMatch(/if \(id !== requestId\.current\) return;/);
  });

  it("offers the map as a fallback when nothing matches", () => {
    expect(search).toMatch(/drop a pin on the map instead/);
  });

  it("fills the form without overwriting a chosen neighbourhood", () => {
    const settings = src("components/coach/CoachSettings.tsx");
    expect(settings).toMatch(/neighbourhood: f\.neighbourhood \|\| r\.neighbourhood \|\| ""/);
    expect(settings).toMatch(/postalCode: r\.postalCode \?\? f\.postalCode/);
  });

  it("scopes results to the market's country", () => {
    // Otherwise a common street name returns the same road abroad.
    const g = src("lib/club/geocode.ts");
    expect(g).toMatch(/regionCode: CLUB_MARKET\.countryCode\.toLowerCase\(\)/);
    // includedRegionCodes belongs to the autocomplete endpoint and is
    // rejected by searchText with INVALID_ARGUMENT. Checked against code
    // with comments stripped — the line above explains the field, and
    // would otherwise trip its own ban.
    const code = g.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/includedRegionCodes/);
    expect(g).toMatch(/components=country:\$\{CLUB_MARKET\.countryCode\}/);
  });

  it("falls back to Geocoding when Places is not enabled", () => {
    // Places is a separate API that must be switched on; until it is,
    // search still works rather than the field appearing broken.
    const g = src("lib/club/geocode.ts");
    expect(g).toMatch(/searchWithPlaces/);
    expect(g).toMatch(/searchWithGeocoding/);
    // null means "unavailable", [] means "no matches" — the distinction is
    // what makes the fallback correct rather than hiding real empty results.
    expect(g).toMatch(/Returns null \(rather than \[\]\) when Places is unavailable/);
  });

  it("keeps the server key server-side", () => {
    expect(src("lib/club/geocode.ts")).toMatch(/process\.env\.GOOGLE_MAPS_SERVER_KEY/);
    expect(src("lib/club/geocode.ts")).not.toMatch(/NEXT_PUBLIC_GOOGLE_MAPS/);
  });

  it("carries a neighbourhood only when it matches the known list", () => {
    expect(src("lib/club/geocode.ts")).toMatch(/neighbourhood: matchKnownNeighbourhood\(area\)/);
  });
});

describe("the location form after simplification", () => {
  const settings = () => src("components/coach/CoachSettings.tsx");
  const search = () => src("components/coach/AddressSearch.tsx");

  it("hints sit below inputs, so side-by-side fields line up", () => {
    // A hint above the input pushed that input down, so "Address"/"Postal
    // code" and "Max distance"/"Travel buffer" only aligned when both
    // fields had hints or neither did.
    const field = settings().slice(settings().indexOf("function Field({"));
    const inputAt = field.indexOf("{children}");
    const hintAt = field.indexOf("{hint &&");
    expect(hintAt).toBeGreaterThan(inputAt);
  });

  it("address search and the address field are one input", () => {
    // Two boxes holding the same text invite them to disagree.
    expect(search()).toMatch(/htmlFor="coach-address"/);
    expect(search()).toMatch(/>Address</);
    expect(settings()).toMatch(/value=\{form\.addressLine\}\s*\n?\s*onChange=/);
    // The separate duplicate Address input is gone.
    expect(settings()).not.toMatch(/<Field label="Address"/);
  });

  it("typing and picking a suggestion both set the address", () => {
    expect(search()).toMatch(/onChange\(e\.target\.value\)/);
    expect(search()).toMatch(/onChange\(chosen\)/);
  });

  it("the location name is optional in the form and in the action", () => {
    expect(settings()).toMatch(/Location name \(optional\)/);
    const actions = src("app/(coach)/coach/actions.ts");
    const fn = actions.slice(actions.indexOf("export async function upsertCoachLocation"));
    // Asking a coach with one place to invent a label for it is a required
    // field with only one sensible answer.
    expect(fn).not.toMatch(/Give this location a name/);
    expect(fn).toMatch(/input\.label\?\.trim\(\) \|\| input\.neighbourhood\?\.trim\(\) \|\| "Main location"/);
  });
});
