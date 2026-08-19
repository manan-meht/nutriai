import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reverseGeocode, searchAddress } from "@/lib/club/geocode";

// Coordinates -> neighbourhood, for the "Where you coach" map.
//
// Server-side rather than called from the browser for three reasons: the
// provider's usage policy wants a real User-Agent, it keeps the choice of
// provider swappable without shipping a new client bundle, and it means
// only signed-in coaches can spend our rate limit.

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // ?q= searches for an address; ?lat=&lng= names the area at a point.
  const query = request.nextUrl.searchParams.get("q");
  if (query !== null) {
    return NextResponse.json({ results: await searchAddress(query) });
  }

  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  return NextResponse.json(await reverseGeocode(lat, lng));
}
