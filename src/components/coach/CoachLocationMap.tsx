"use client";

import { useEffect, useRef, useState } from "react";
import { CLUB_TOKENS as T } from "./tokens";
import { MARKET_CENTRE } from "@/lib/club/geocode";

// Map picker for "Where you coach", on Google Maps.
//
// The browser key is referrer-restricted and limited to the Maps
// JavaScript API. It ships in the page by necessity — a JS map cannot load
// otherwise — so the restriction is what protects it, and it deliberately
// cannot call Places or Geocoding. Those run server-side with the other
// key, behind /api/coach/geocode.
//
// Privacy rule governing this screen: the pin is the coach's real location
// and is stored, but clients only ever see the neighbourhood. The exact
// address is released only after a booking is confirmed. This is a
// coach-facing tool, not a public one.

const BROWSER_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;

export interface PinnedLocation {
  latitude: number;
  longitude: number;
}

/** Loads the Maps JS API once per page, even if two components ask at the
 * same time — a second <script> tag makes Google warn and reinitialise.
 *
 * Resolves with the constructors rather than void. Under `loading=async`
 * the script's onload fires before google.maps is populated: the bootstrap
 * defines importLibrary() and nothing else, so touching google.maps.Map at
 * that point throws "not a constructor". Awaiting importLibrary is what
 * actually guarantees the classes exist.
 */
type MapsApi = { Map: any; Circle: any; Marker: any };
let mapsPromise: Promise<MapsApi> | null = null;

function loadGoogleMaps(): Promise<MapsApi> {
  if (mapsPromise) return mapsPromise;

  mapsPromise = (async () => {
    const g = () => (window as any).google;

    if (!g()?.maps?.importLibrary) {
      await new Promise<void>((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>("script[data-google-maps]");
        if (existing) {
          existing.addEventListener("load", () => resolve());
          existing.addEventListener("error", () => reject(new Error("Google Maps failed to load")));
          return;
        }
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&loading=async&v=weekly`;
        script.async = true;
        script.dataset.googleMaps = "true";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Google Maps failed to load"));
        document.head.appendChild(script);
      });
    }

    const maps = await g().maps.importLibrary("maps");

    // The legacy Marker has moved between libraries across Maps versions,
    // and asking for a library that doesn't provide it yields undefined
    // rather than an error — which then fails later as "not a constructor",
    // far from the cause. Take it from wherever it actually is.
    let Marker = maps.Marker ?? g().maps.Marker;
    if (!Marker) {
      const markerLib = await g().maps.importLibrary("marker").catch(() => null);
      Marker = markerLib?.Marker;
    }
    if (!maps.Map || !Marker) throw new Error("Maps libraries loaded without Map/Marker");

    return { Map: maps.Map, Circle: maps.Circle ?? g().maps.Circle, Marker };
  })().catch((err) => {
    // Let a later attempt retry rather than caching the failure forever.
    mapsPromise = null;
    throw err;
  });

  return mapsPromise;
}

export function CoachLocationMap({
  value,
  radiusKm,
  onChange,
  onNeighbourhoodDetected,
}: {
  value: PinnedLocation | null;
  /** Drawn as a circle when the coach travels to clients. */
  radiusKm: number | null;
  onChange: (next: PinnedLocation) => void;
  /** Fired when a lookup matches a neighbourhood we know about. */
  onNeighbourhoodDetected?: (neighbourhood: string, rawArea: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState<null | "no-key" | "blocked">(null);
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!BROWSER_KEY) {
        console.error(
          "[map] NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is not set in this build. " +
            "NEXT_PUBLIC_* values are inlined at build time, so the dev server " +
            "must be restarted after adding it."
        );
        if (!cancelled) setFailure("no-key");
        return;
      }
      let api: MapsApi;
      try {
        api = await loadGoogleMaps();
      } catch (err) {
        // Overwhelmingly this is a browser extension blocking
        // maps.googleapis.com, or the key's referrer restriction not
        // covering this origin. Both look identical from here, so say so
        // rather than leaving a dead end.
        console.error("[map] Google Maps failed to load:", err);
        if (!cancelled) setFailure("blocked");
        return;
      }
      if (cancelled || !containerRef.current || mapRef.current) return;

      const start = value ?? MARKET_CENTRE;
      const centre = { lat: start.latitude, lng: start.longitude };

      const map = new api.Map(containerRef.current, {
        center: centre,
        zoom: value ? 16 : 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      const marker = new api.Marker({
        position: centre,
        map,
        draggable: true,
      });

      marker.addListener("dragend", () => {
        const p = marker.getPosition();
        const next = { latitude: p.lat(), longitude: p.lng() };
        circleRef.current?.setCenter(p);
        onChangeRef.current(next);
      });

      map.addListener("click", (e: any) => {
        const next = { latitude: e.latLng.lat(), longitude: e.latLng.lng() };
        marker.setPosition(e.latLng);
        circleRef.current?.setCenter(e.latLng);
        onChangeRef.current(next);
      });

      mapRef.current = map;
      markerRef.current = marker;
      setReady(true);
    })();
    return () => { cancelled = true; };
    // Once: later value changes are pushed onto the existing map below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker and view in step with the form.
  useEffect(() => {
    if (!ready || !value || !mapRef.current) return;
    const pos = { lat: value.latitude, lng: value.longitude };
    markerRef.current?.setPosition(pos);
    circleRef.current?.setCenter(pos);
    mapRef.current.panTo(pos);
  }, [ready, value]);

  // Radius circle.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const centre = value ?? MARKET_CENTRE;
    if (circleRef.current) {
      circleRef.current.setMap(null);
      circleRef.current = null;
    }
    if (radiusKm && radiusKm > 0) {
      circleRef.current = new (window as any).google.maps.Circle({
        map: mapRef.current,
        center: { lat: centre.latitude, lng: centre.longitude },
        radius: radiusKm * 1000,
        strokeColor: T.primary,
        strokeOpacity: 0.8,
        strokeWeight: 1,
        fillColor: T.primary,
        fillOpacity: 0.12,
      });
    }
  }, [ready, radiusKm, value]);

  async function lookupNeighbourhood(lat: number, lng: number) {
    if (!onNeighbourhoodDetected) return;
    try {
      const res = await fetch(`/api/coach/geocode?lat=${lat}&lng=${lng}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.neighbourhood) {
        onNeighbourhoodDetected(json.neighbourhood, json.rawArea ?? null);
        setStatus(`Detected ${json.neighbourhood}`);
      } else if (json.rawArea) {
        setStatus(`Found ${json.rawArea} — pick the closest neighbourhood below.`);
      }
    } catch {
      // Silent: the coach can always choose a neighbourhood by hand.
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setStatus("This browser can't share your location.");
      return;
    }
    setLocating(true);
    setStatus(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        onChangeRef.current(next);
        mapRef.current?.setZoom(16);
        setLocating(false);
        void lookupNeighbourhood(next.latitude, next.longitude);
      },
      (err) => {
        setLocating(false);
        setStatus(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — tap the map to drop a pin instead."
            : "Couldn't get your location — tap the map to drop a pin instead."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating || failure !== null}
          className="rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ borderColor: T.outlineVariant }}
        >
          {locating ? "Locating…" : "Use my current location"}
        </button>
        <span className="text-xs" style={{ color: T.onSurfaceVariant }}>
          or tap the map to drop a pin, and drag it to adjust
        </span>
      </div>

      {failure ? (
        <div
          className="rounded-2xl border border-dashed px-4 py-5 text-center text-sm"
          style={{ borderColor: T.outlineVariant, color: T.onSurfaceVariant }}
        >
          <p className="font-medium" style={{ color: T.onSurface }}>The map couldn&rsquo;t load.</p>
          <p className="mx-auto mt-1.5 max-w-md">
            {failure === "no-key"
              ? "No Maps key is configured for this build."
              : "It was blocked before it could start — usually an ad or privacy blocker stopping maps.googleapis.com, or the key not allowing this address."}
          </p>
          <p className="mt-2 text-xs">
            Address search still works, and you can type your neighbourhood below. See the browser
            console for the exact reason.
          </p>
        </div>
      ) : (
        <div
          ref={containerRef}
          className="h-64 w-full overflow-hidden rounded-2xl border"
          style={{ backgroundColor: T.surfaceContainerLow, borderColor: T.outlineVariant }}
          role="application"
          aria-label="Map for choosing where you coach"
        />
      )}

      <p className="mt-2 text-xs" style={{ color: T.onSurfaceVariant }}>
        {value
          ? `Pinned at ${value.latitude.toFixed(4)}, ${value.longitude.toFixed(4)} — clients only ever see your neighbourhood.`
          : "No location pinned yet."}
      </p>
      {status && (
        <p className="mt-1 text-xs" style={{ color: T.primary }} role="status">
          {status}
        </p>
      )}
    </div>
  );
}
