"use client";

import { useEffect, useRef, useState } from "react";
// Leaflet positions tiles with its own CSS; without this the map renders
// as a scrambled grid. Imported here rather than globally so it only
// loads on the one screen that shows a map.
import "leaflet/dist/leaflet.css";
import { CLUB_TOKENS as T } from "./tokens";
import { MARKET_CENTRE } from "@/lib/club/geocode";

// Map picker for "Where you coach".
//
// Leaflet with OpenStreetMap tiles: no API key, no billing account, works
// today. The provider is isolated here and in lib/club/geocode.ts, so
// moving to Google or Mapbox later is those two files and a key.
//
// Leaflet is imported dynamically inside an effect because it touches
// `window` at module scope and would break server rendering.
//
// Privacy note that governs this whole screen: the pin is the coach's real
// location and is stored, but clients only ever see the neighbourhood
// (discovery and the public profile expose nothing else, and the exact
// address is released only after a booking is confirmed). The map is a
// coach-facing tool, not a public one.

export interface PinnedLocation {
  latitude: number;
  longitude: number;
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
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current || mapRef.current) return;

      const start = value ?? MARKET_CENTRE;
      const map = L.map(containerRef.current, { attributionControl: true }).setView(
        [start.latitude, start.longitude],
        value ? 15 : 12
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // A plain circle marker avoids Leaflet's default icon, whose PNGs
      // resolve relative to the CSS and 404 under a bundler.
      const marker = L.circleMarker([start.latitude, start.longitude], {
        radius: 9,
        color: "#FFFFFF",
        weight: 3,
        fillColor: T.primary,
        fillOpacity: 1,
      }).addTo(map);

      map.on("click", (e: any) => {
        const next = { latitude: e.latlng.lat, longitude: e.latlng.lng };
        marker.setLatLng(e.latlng);
        circleRef.current?.setLatLng(e.latlng);
        onChangeRef.current(next);
      });

      mapRef.current = map;
      markerRef.current = marker;
      setReady(true);
      // Tiles can lay out before the container has its final size.
      setTimeout(() => map.invalidateSize(), 0);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // Deliberately once: later value changes are pushed onto the existing
    // map below rather than rebuilding it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker and radius in step with props.
  useEffect(() => {
    if (!ready || !value) return;
    markerRef.current?.setLatLng([value.latitude, value.longitude]);
    mapRef.current?.setView([value.latitude, value.longitude], mapRef.current.getZoom());
  }, [ready, value]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const centre = value ?? MARKET_CENTRE;
      if (circleRef.current) {
        mapRef.current.removeLayer(circleRef.current);
        circleRef.current = null;
      }
      if (radiusKm && radiusKm > 0) {
        circleRef.current = L.circle([centre.latitude, centre.longitude], {
          radius: radiusKm * 1000,
          color: T.primary,
          weight: 1,
          fillColor: T.primary,
          fillOpacity: 0.12,
        }).addTo(mapRef.current);
      }
    })();
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
        mapRef.current?.setView([next.latitude, next.longitude], 15);
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
          disabled={locating}
          className="rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60"
          style={{ borderColor: T.outlineVariant }}
        >
          {locating ? "Locating…" : "Use my current location"}
        </button>
        <span className="text-xs" style={{ color: T.onSurfaceVariant }}>
          or tap the map to drop a pin
        </span>
      </div>

      <div
        ref={containerRef}
        className="h-64 w-full overflow-hidden rounded-2xl"
        style={{ backgroundColor: T.surfaceContainerLow, borderColor: T.outlineVariant, borderWidth: 1 }}
        role="application"
        aria-label="Map for choosing where you coach"
      />

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
