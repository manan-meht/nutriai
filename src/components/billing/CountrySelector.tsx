"use client";

import { useState, useTransition } from "react";
import { confirmBillingCountry } from "@/app/actions/billing";

// The 4 launch countries get their own market; everything else is INTL
// (USD). This list is for the selector UI only — marketForCountry() in
// lib/billing/market.ts is the actual server-side source of truth for what
// each code maps to.
const COUNTRIES = [
  { code: "US", label: "United States" },
  { code: "SG", label: "Singapore" },
  { code: "AU", label: "Australia" },
  { code: "IN", label: "India" },
  { code: "GB", label: "United Kingdom" },
  { code: "CA", label: "Canada" },
  { code: "TH", label: "Thailand" },
  { code: "NZ", label: "New Zealand" },
  { code: "DE", label: "Germany" },
  { code: "AE", label: "United Arab Emirates" },
  { code: "OTHER", label: "Other country" },
];

interface CountrySelectorProps {
  detectedCountry: string | null;
  confirmedCountry: string | null;
  onConfirmed?: (countryCode: string, market: string) => void;
}

export function CountrySelector({ detectedCountry, confirmedCountry, onConfirmed }: CountrySelectorProps) {
  const initial = confirmedCountry ?? detectedCountry ?? "OTHER";
  const [selected, setSelected] = useState(
    COUNTRIES.some((c) => c.code === initial) ? initial : "OTHER"
  );
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleChange(code: string) {
    setSelected(code);
    setSaved(false);
    // "Other country" isn't a real ISO code — resolve it server-side as
    // INTL by passing a code outside the launch-market list (XX is treated
    // as unknown/INTL by marketForCountry).
    const countryToConfirm = code === "OTHER" ? "XX" : code;
    startTransition(async () => {
      const { market } = await confirmBillingCountry(countryToConfirm);
      setSaved(true);
      onConfirmed?.(countryToConfirm, market);
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="billing-country" className="text-sm font-medium text-gray-700">
        Billing country
      </label>
      <select
        id="billing-country"
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
        className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-transparent focus:ring-2 focus:ring-gray-400 transition disabled:opacity-60"
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.label}
          </option>
        ))}
      </select>
      {detectedCountry && !confirmedCountry && (
        <p className="text-xs text-gray-400">
          Detected from your location. Not correct? Choose your billing country above.
        </p>
      )}
      {saved && <p className="text-xs text-green-600">Saved.</p>}
    </div>
  );
}
