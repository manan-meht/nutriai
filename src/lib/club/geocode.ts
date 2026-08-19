import { CLUB_MARKET, SG_NEIGHBOURHOODS } from "./config";

// Reverse geocoding: coordinates -> a neighbourhood we already know about.
//
// The neighbourhood is not decoration. It is what a client sees (the exact
// address is never public) and what discovery filters on, so it must stay
// one of SG_NEIGHBOURHOODS rather than becoming whatever free text a
// geocoder happens to return. This maps a lookup back onto that list and
// gives up rather than inventing a value.
//
// OpenStreetMap's Nominatim is used because it needs no API key and no
// billing account. It is rate-limited and asks for a real User-Agent, both
// respected below. Swapping in Google or Mapbox later means replacing this
// one function — nothing else knows where the answer came from.

const NOMINATIM = "https://nominatim.openstreetmap.org/reverse";

export interface ReverseGeocodeResult {
  /** One of SG_NEIGHBOURHOODS, or null when nothing matched. */
  neighbourhood: string | null;
  /** Whatever the provider called the area, for display while confirming. */
  rawArea: string | null;
}

/** Best match from our known list for a free-text area name. Exact first,
 * then containment either way ("Tanjong Pagar" vs "Tanjong Pagar Road"). */
export function matchKnownNeighbourhood(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const needle = raw.trim().toLowerCase();
  if (!needle) return null;

  const exact = SG_NEIGHBOURHOODS.find((n) => n.toLowerCase() === needle);
  if (exact) return exact;

  return (
    SG_NEIGHBOURHOODS.find((n) => needle.includes(n.toLowerCase())) ??
    SG_NEIGHBOURHOODS.find((n) => n.toLowerCase().includes(needle)) ??
    null
  );
}

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> {
  const url = `${NOMINATIM}?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=14&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim's usage policy requires identifying the application.
        "User-Agent": "TistraClub/1.0 (https://tistra.club)",
        "Accept-Language": "en",
      },
      // A coach is waiting on this; a slow geocoder must not hang the form.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { neighbourhood: null, rawArea: null };
    const json: any = await res.json();
    const a = json?.address ?? {};
    const rawArea: string | null =
      a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district ?? a.town ?? a.city ?? null;
    return { neighbourhood: matchKnownNeighbourhood(rawArea), rawArea };
  } catch {
    // Never fatal: the coach can still pick a neighbourhood by hand.
    return { neighbourhood: null, rawArea: null };
  }
}

/** Where the map opens when a coach has no location yet. */
export const MARKET_CENTRE = CLUB_MARKET.centre;
