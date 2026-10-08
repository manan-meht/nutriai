import { HealthAnalyticsTag } from "@/components/marketing/HealthAnalyticsTag";

// Every Tistra Health page carries the GA4 tag, per Google's instruction
// ("every page of your website... don't add more than one"). A layout
// rather than a per-page import so a new route cannot be missed, and an
// existing one cannot be tagged twice.
//
// Not in the ROOT layout, for the reason the coach layout records: the root
// wraps Tistra Health, Tistra Club and Coach OS alike, and telling them
// apart needs headers(), which would force every page of all three to
// render dynamically. HealthAnalyticsTag host-checks for the same reason —
// this group also serves the club and coach landing pages.
export default function HealthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HealthAnalyticsTag />
      {children}
    </>
  );
}
