import { CLUB_MARKET, SG_NEIGHBOURHOODS } from "./config";

// Geocoding for "Where you coach", on Google Maps Platform.
//
// Two calls are used:
//   Places API (New) "searchText" for address search, because it handles
//     partial input the way a person types it; and
//   Geocoding API for pin -> area, and as the search fallback.
//
// The fallback is deliberate rather than defensive padding: Places is a
// separate API that has to be enabled on the project, and until it is,
// search still works through Geocoding instead of the field appearing
// broken. It upgrades itself the moment Places is switched on.
//
// The server key is used for both and never reaches the browser — that is
// why these run behind /api/coach/geocode instead of being called from the
// client. The browser key (referrer-restricted, Maps JavaScript only)
// renders the map and nothing else.

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

function serverKey(): string | undefined {
  return process.env.GOOGLE_MAPS_SERVER_KEY;
}

export interface ReverseGeocodeResult {
  /** One of SG_NEIGHBOURHOODS, or null when nothing matched. */
  neighbourhood: string | null;
  /** Whatever Google called the area, for display while confirming. */
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

/** Area names, most specific first, from Geocoding address components. */
const AREA_TYPES = ["neighborhood", "sublocality_level_1", "sublocality", "locality"];

export async function reverseGeocode(
  latitude: number,
  longitude: number
): Promise<ReverseGeocodeResult> {
  const key = serverKey();
  if (!key) return { neighbourhood: null, rawArea: null };

  try {
    const res = await fetch(
      `${GEOCODE_URL}?latlng=${latitude},${longitude}&key=${key}&language=en`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return { neighbourhood: null, rawArea: null };
    const json: any = await res.json();
    if (json.status !== "OK") return { neighbourhood: null, rawArea: null };

    const components: any[] = json.results?.flatMap((r: any) => r.address_components ?? []) ?? [];
    let rawArea: string | null = null;
    for (const type of AREA_TYPES) {
      const hit = components.find((c) => (c.types ?? []).includes(type));
      if (hit) { rawArea = hit.long_name; break; }
    }
    return { neighbourhood: matchKnownNeighbourhood(rawArea), rawArea };
  } catch {
    // Never fatal: the coach can still pick a neighbourhood by hand.
    return { neighbourhood: null, rawArea: null };
  }
}

export interface AddressSuggestion {
  /** One line, as a person would write it. */
  label: string;
  addressLine: string | null;
  postalCode: string | null;
  /** Matched against SG_NEIGHBOURHOODS; null when nothing matched. */
  neighbourhood: string | null;
  latitude: number;
  longitude: number;
}

function componentValue(components: any[], type: string): string | null {
  const hit = components.find((c) => (c.types ?? []).includes(type));
  return hit ? (hit.longText ?? hit.long_name ?? null) : null;
}

/** Address search. Scoped to the market's country so a common street name
 * doesn't return the same road on another continent. */
export async function searchAddress(query: string, limit = 5): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const key = serverKey();
  if (!key) return [];

  const viaPlaces = await searchWithPlaces(q, limit, key);
  if (viaPlaces !== null) return viaPlaces;
  return searchWithGeocoding(q, limit, key);
}

/** Returns null (rather than []) when Places is unavailable, so the caller
 * can tell "not enabled" apart from "no matches" and fall back. */
async function searchWithPlaces(q: string, limit: number, key: string): Promise<AddressSuggestion[] | null> {
  try {
    const res = await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.formattedAddress,places.location,places.addressComponents,places.displayName",
      },
      body: JSON.stringify({
        textQuery: q,
        includedRegionCodes: [CLUB_MARKET.countryCode.toLowerCase()],
        maxResultCount: limit,
        languageCode: "en",
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json: any = await res.json();
    if (json.error) return null;

    return (json.places ?? []).map((p: any) => {
      const components: any[] = p.addressComponents ?? [];
      const streetNumber = componentValue(components, "street_number");
      const route = componentValue(components, "route");
      const area =
        componentValue(components, "neighborhood") ??
        componentValue(components, "sublocality_level_1") ??
        componentValue(components, "sublocality") ??
        componentValue(components, "locality");
      return {
        label: p.formattedAddress ?? p.displayName?.text ?? q,
        addressLine:
          [streetNumber, route].filter(Boolean).join(" ") || p.displayName?.text || null,
        postalCode: componentValue(components, "postal_code"),
        neighbourhood: matchKnownNeighbourhood(area),
        latitude: Number(p.location?.latitude),
        longitude: Number(p.location?.longitude),
      };
    }).filter((s: AddressSuggestion) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  } catch {
    return null;
  }
}

async function searchWithGeocoding(q: string, limit: number, key: string): Promise<AddressSuggestion[]> {
  try {
    const res = await fetch(
      `${GEOCODE_URL}?address=${encodeURIComponent(q)}&components=country:${CLUB_MARKET.countryCode}&key=${key}&language=en`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return [];
    const json: any = await res.json();
    if (json.status !== "OK") return [];

    return (json.results ?? []).slice(0, limit).map((r: any) => {
      const components: any[] = r.address_components ?? [];
      const streetNumber = componentValue(components, "street_number");
      const route = componentValue(components, "route");
      const area =
        componentValue(components, "neighborhood") ??
        componentValue(components, "sublocality_level_1") ??
        componentValue(components, "sublocality") ??
        componentValue(components, "locality");
      return {
        label: r.formatted_address,
        addressLine: [streetNumber, route].filter(Boolean).join(" ") || r.formatted_address,
        postalCode: componentValue(components, "postal_code"),
        neighbourhood: matchKnownNeighbourhood(area),
        latitude: Number(r.geometry?.location?.lat),
        longitude: Number(r.geometry?.location?.lng),
      };
    }).filter((s: AddressSuggestion) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude));
  } catch {
    return [];
  }
}

/** Where the map opens when a coach has no location yet. */
export const MARKET_CENTRE = CLUB_MARKET.centre;
