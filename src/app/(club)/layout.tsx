import { GoogleAdsTag } from "@/components/marketing/GoogleAdsTag";

// Every page of Tistra Club carries the Google tag, alongside Tistra Coach.
//
// Google's "test installation" check fetches the domain registered on the
// Ads account, and reported the tag as missing while it lived only on
// coach.tistra.club. The tag also has to be on whatever page an ad click
// lands on: without it there, the gclid is never written to a first-party
// cookie and a later conversion cannot be attributed to the click.
//
// A layout rather than per-page imports, so a new club route cannot miss
// it and an existing one cannot end up with two — Google explicitly warns
// against more than one tag per page.
//
// Deliberately not in the ROOT layout: telling these hosts apart there
// needs headers(), which forces every page of all three products to render
// dynamically. Club routes are already dynamic.
export default function ClubLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GoogleAdsTag />
      {children}
    </>
  );
}
