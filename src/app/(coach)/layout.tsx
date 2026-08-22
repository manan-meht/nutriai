import { GoogleAdsTag } from "@/components/marketing/GoogleAdsTag";

// Every page of the Coach OS carries the Google tag, per Google's own
// instruction ("every page of your website... don't add more than one").
// A layout rather than a per-page import so it cannot be forgotten on a
// new route, and cannot be doubled up on an existing one.
//
// Not in the ROOT layout: that would need headers() to tell the coach host
// from Tistra Health and Tistra Club, which forces every page of all three
// products to render dynamically. These routes are already dynamic (they
// are behind auth), so scoping it here is free.
export default function CoachLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GoogleAdsTag />
      {children}
    </>
  );
}
