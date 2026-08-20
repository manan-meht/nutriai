"use client";

import { useEffect, useRef, useState } from "react";
import { CLUB_TOKENS as T } from "./tokens";
import { MIN_SEARCH_LENGTH, type AddressSuggestion } from "@/lib/club/geocode";

// Address search for "Where you coach".
//
// Debounced to 600ms with a 4-character minimum. Places "searchText" is
// billed per request, so an undebounced field turns typing an address into
// a dozen charges; identical queries are also cached server-side, which
// covers the backspace-and-retype pattern.
//
// Requests are sequenced, and a stale response is discarded rather than
// rendered — without that, a slow early request can land after a fast later
// one and repopulate the list with results for a prefix the coach has
// already typed past.

export function AddressSearch({
  value,
  onChange,
  onSelect,
}: {
  /** The stored address line — this input IS the address field, not a
   * separate search box that populates one. Two boxes holding the same
   * text invites them to disagree. */
  value: string;
  onChange: (next: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_SEARCH_LENGTH) {
      setResults([]);
      setNoResults(false);
      return;
    }

    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/coach/geocode?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        // A response from an older keystroke must not overwrite a newer one.
        if (id !== requestId.current) return;
        const found: AddressSuggestion[] = json.results ?? [];
        setResults(found);
        setNoResults(found.length === 0);
        setOpen(true);
      } catch {
        if (id === requestId.current) setNoResults(true);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <label className="mb-1.5 block text-sm font-medium" htmlFor="coach-address">Address</label>
      <input
        id="coach-address"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          // Typed text is the address; picking a suggestion additionally
          // fills the postal code and moves the map.
          onChange(e.target.value);
        }}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="e.g. 192 Depot Road"
        autoComplete="off"
        className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
        style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}
        role="combobox"
        aria-expanded={open}
        aria-controls="address-results"
      />
      <p className="mt-1.5 text-xs" style={{ color: T.onSurfaceVariant }}>
        {searching
          ? "Searching…"
          : "Start typing and pick a result — we'll fill in the postal code and drop the pin. Kept private unless you choose to show it below."}
      </p>

      {open && (results.length > 0 || noResults) && (
        <>
          {/* Click-away, behind the list. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <ul
            id="address-results"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border shadow-lg"
            style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}
          >
            {noResults ? (
              <li className="px-4 py-3 text-sm" style={{ color: T.onSurfaceVariant }}>
                No matches. Try a postal code, or drop a pin on the map instead.
              </li>
            ) : (
              results.map((r) => (
                <li key={`${r.latitude},${r.longitude},${r.label}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(r);
                      const chosen = r.addressLine ?? r.label;
                      setQuery(chosen);
                      onChange(chosen);
                      setOpen(false);
                    }}
                    className="block w-full px-4 py-3 text-left text-sm"
                  >
                    <span className="font-medium">{r.addressLine ?? r.label}</span>
                    {r.postalCode && (
                      <span className="ml-2 text-xs tabular-nums" style={{ color: T.onSurfaceVariant }}>
                        {r.postalCode}
                      </span>
                    )}
                    <span className="mt-0.5 block truncate text-xs" style={{ color: T.onSurfaceVariant }}>
                      {r.label}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  );
}
