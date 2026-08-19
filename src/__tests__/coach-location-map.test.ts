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

describe("map provider is isolated", () => {
  it("loads leaflet lazily and ships its stylesheet", () => {
    const map = src("components/coach/CoachLocationMap.tsx");
    // Leaflet touches window at module scope, so a static import breaks SSR.
    expect(map).toMatch(/await import\("leaflet"\)/);
    expect(map).toMatch(/leaflet\/dist\/leaflet\.css/);
  });

  it("keeps the pin private to the coach", () => {
    const map = src("components/coach/CoachLocationMap.tsx");
    expect(map).toMatch(/clients only ever see your neighbourhood/i);
  });
});

describe("address search", () => {
  const search = src("components/coach/AddressSearch.tsx");

  it("debounces and sets a minimum length", () => {
    // The geocoder is free and keyless and asks for at most one request a
    // second; typing "192 depot road" would otherwise fire thirteen.
    expect(search).toMatch(/setTimeout\([\s\S]{0,400}?450\)/);
    expect(search).toMatch(/q\.length < 3/);
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
    expect(src("lib/club/geocode.ts")).toMatch(/countrycodes=\$\{CLUB_MARKET\.countryCode\.toLowerCase\(\)\}/);
  });

  it("carries a neighbourhood only when it matches the known list", () => {
    expect(src("lib/club/geocode.ts")).toMatch(/neighbourhood: matchKnownNeighbourhood\(area\)/);
  });
});
