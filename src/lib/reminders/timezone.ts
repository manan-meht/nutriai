// Best-guess starting point only — a phone country code is a poor proxy for
// timezone in any country spanning multiple zones (US, Canada, Russia,
// Brazil, Australia...). This is why the timezone is always shown as an
// editable field wherever it's set, never applied silently. Codes below are
// calling codes without the leading "+", longest-prefix-matched so e.g. "1242"
// (Bahamas) is checked before falling back to "1" (US/Canada).
const COUNTRY_CODE_TIMEZONES: Array<[string, string]> = [
  ["91", "Asia/Kolkata"],       // India
  ["65", "Asia/Singapore"],     // Singapore
  ["66", "Asia/Bangkok"],       // Thailand
  ["971", "Asia/Dubai"],        // UAE
  ["974", "Asia/Qatar"],        // Qatar
  ["966", "Asia/Riyadh"],       // Saudi Arabia
  ["92", "Asia/Karachi"],       // Pakistan
  ["880", "Asia/Dhaka"],        // Bangladesh
  ["94", "Asia/Colombo"],       // Sri Lanka
  ["977", "Asia/Kathmandu"],    // Nepal
  ["60", "Asia/Kuala_Lumpur"],  // Malaysia
  ["62", "Asia/Jakarta"],       // Indonesia
  ["63", "Asia/Manila"],        // Philippines
  ["84", "Asia/Ho_Chi_Minh"],   // Vietnam
  ["86", "Asia/Shanghai"],      // China
  ["81", "Asia/Tokyo"],         // Japan
  ["82", "Asia/Seoul"],         // South Korea
  ["852", "Asia/Hong_Kong"],    // Hong Kong
  ["44", "Europe/London"],      // UK
  ["353", "Europe/Dublin"],     // Ireland
  ["49", "Europe/Berlin"],      // Germany
  ["33", "Europe/Paris"],       // France
  ["34", "Europe/Madrid"],      // Spain
  ["39", "Europe/Rome"],        // Italy
  ["31", "Europe/Amsterdam"],   // Netherlands
  ["41", "Europe/Zurich"],      // Switzerland
  ["46", "Europe/Stockholm"],   // Sweden
  ["61", "Australia/Sydney"],   // Australia (east coast default)
  ["64", "Pacific/Auckland"],   // New Zealand
  ["27", "Africa/Johannesburg"],// South Africa
  ["234", "Africa/Lagos"],      // Nigeria
  ["254", "Africa/Nairobi"],    // Kenya
  ["20", "Africa/Cairo"],       // Egypt
  ["55", "America/Sao_Paulo"],  // Brazil (most populous zone default)
  ["52", "America/Mexico_City"],// Mexico
  ["1", "America/New_York"],    // US/Canada (eastern default)
];

/** Best-effort timezone guess from a phone number's calling code — always
 * meant to prefill an editable field, never used as the sole source of
 * truth (see module comment). */
export function guessTimezoneFromCountryCode(countryCode: string): string {
  const digits = countryCode.replace(/\D/g, "");
  const match = COUNTRY_CODE_TIMEZONES
    .filter(([code]) => digits.startsWith(code))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return match?.[1] ?? "Asia/Kolkata";
}

// A reasonably broad, curated set for the timezone picker — not every IANA
// zone, just enough to cover Tistra's actual and plausible near-term
// markets plus common diaspora locations.
export const COMMON_TIMEZONES = [
  "Asia/Kolkata", "Asia/Singapore", "Asia/Bangkok", "Asia/Dubai", "Asia/Qatar",
  "Asia/Riyadh", "Asia/Karachi", "Asia/Dhaka", "Asia/Colombo", "Asia/Kathmandu",
  "Asia/Kuala_Lumpur", "Asia/Jakarta", "Asia/Manila", "Asia/Ho_Chi_Minh",
  "Asia/Shanghai", "Asia/Tokyo", "Asia/Seoul", "Asia/Hong_Kong",
  "Europe/London", "Europe/Dublin", "Europe/Berlin", "Europe/Paris",
  "Europe/Madrid", "Europe/Rome", "Europe/Amsterdam", "Europe/Zurich", "Europe/Stockholm",
  "Australia/Sydney", "Australia/Perth", "Pacific/Auckland",
  "Africa/Johannesburg", "Africa/Lagos", "Africa/Nairobi", "Africa/Cairo",
  "America/Sao_Paulo", "America/Mexico_City",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "UTC",
] as const;
