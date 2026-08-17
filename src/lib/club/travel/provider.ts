// Travel-time provider abstraction (ADR-004).
//
// A coach cannot teleport between clients, so availability depends on real
// travel feasibility. No maps provider existed in this repo, so this is the
// seam: one interface, a Google Routes implementation for production and an
// explicitly-marked estimate for local development.
//
// The mock MUST NEVER return zero travel time (spec) — silently assuming
// teleportation is the exact failure this abstraction exists to prevent.

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface TravelEstimate {
  minutes: number;
  distanceKm: number;
  /** True when this came from a distance heuristic rather than live
   * routing. Callers widen their safety buffer when set — see
   * ESTIMATE_SAFETY_MULTIPLIER in the availability engine. */
  estimated: boolean;
}

export interface TravelTimeProvider {
  readonly name: string;
  /** Departure time matters (traffic); providers that ignore it must still
   * accept it so the interface doesn't change when one is swapped in. */
  travelTime(origin: GeoPoint, destination: GeoPoint, departAt: Date): Promise<TravelEstimate>;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Development/offline provider. Straight-line distance inflated by a
 * road-winding factor, divided by an assumed city speed, with a floor —
 * crossing Singapore is never instant even for adjacent postcodes.
 */
export class EstimatedTravelTimeProvider implements TravelTimeProvider {
  readonly name = "estimated";

  /** Roads are not straight lines; ~1.35x is a reasonable urban detour
   * factor for Singapore's grid. */
  private static readonly DETOUR_FACTOR = 1.35;
  /** Average door-to-door speed including parking/walking, km/h. */
  private static readonly ASSUMED_SPEED_KMH = 22;
  /** Even a next-door session needs pack-up and walk time. */
  private static readonly FLOOR_MINUTES = 10;

  // Accepts departAt for interface parity even though a distance heuristic
  // has no notion of traffic — swapping providers must not change callers.
  async travelTime(origin: GeoPoint, destination: GeoPoint, _departAt?: Date): Promise<TravelEstimate> {
    const straight = haversineKm(origin, destination);
    const distanceKm = straight * EstimatedTravelTimeProvider.DETOUR_FACTOR;
    const minutes = Math.max(
      EstimatedTravelTimeProvider.FLOOR_MINUTES,
      Math.ceil((distanceKm / EstimatedTravelTimeProvider.ASSUMED_SPEED_KMH) * 60)
    );
    return { minutes, distanceKm: Number(distanceKm.toFixed(2)), estimated: true };
  }
}

/**
 * Google Routes distance-matrix provider. Kept behind the same interface so
 * swapping it in is a config change, not a code change.
 */
export class GoogleRoutesTravelTimeProvider implements TravelTimeProvider {
  readonly name = "google-routes";
  private readonly fallback = new EstimatedTravelTimeProvider();

  constructor(private readonly apiKey: string) {}

  async travelTime(origin: GeoPoint, destination: GeoPoint, departAt: Date): Promise<TravelEstimate> {
    try {
      const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": this.apiKey,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
        },
        body: JSON.stringify({
          origin: { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } },
          destination: { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } },
          travelMode: "DRIVE",
          routingPreference: "TRAFFIC_AWARE",
          departureTime: departAt.toISOString(),
        }),
      });
      if (!res.ok) throw new Error(`routes ${res.status}`);
      const body = (await res.json()) as { routes?: Array<{ duration?: string; distanceMeters?: number }> };
      const route = body.routes?.[0];
      if (!route?.duration) throw new Error("no route");
      return {
        minutes: Math.ceil(Number(route.duration.replace("s", "")) / 60),
        distanceKm: Number(((route.distanceMeters ?? 0) / 1000).toFixed(2)),
        estimated: false,
      };
    } catch (err) {
      // Degrade to the estimate rather than assuming zero — an unreachable
      // routing API must never turn into "these two sessions are compatible".
      console.error("[club/travel] routes lookup failed, using estimate:", err instanceof Error ? err.message : err);
      return this.fallback.travelTime(origin, destination, departAt);
    }
  }
}

export function getTravelTimeProvider(): TravelTimeProvider {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const enabled = process.env.CLUB_TRAVEL_TIME_ENABLED !== "false";
  if (enabled && key) return new GoogleRoutesTravelTimeProvider(key);
  return new EstimatedTravelTimeProvider();
}

/** Fee for a distance, from the coach's configurable bands (first band
 * whose uptoKm >= distance wins). Null = beyond the coach's last band, i.e.
 * out of range. */
export function travelFeeCents(distanceKm: number, bands: Array<{ uptoKm: number; feeCents: number }>): number | null {
  const sorted = [...bands].sort((a, b) => a.uptoKm - b.uptoKm);
  for (const band of sorted) if (distanceKm <= band.uptoKm) return band.feeCents;
  return null;
}
