"use client";

import { useEffect, useState } from "react";
import { TrackedCta } from "./TrackedCta";

/** Phone-only CTA that follows the coach down the page.
 *
 * This page is a Google Ads destination and most of that traffic is mobile,
 * where the decision to sign up rarely happens in the first viewport — it
 * happens three sections down, at which point the hero button is long gone
 * and the next one is another screen away. The bar removes that dead zone.
 *
 * It appears only after real scrolling, so it never covers the hero CTA it
 * duplicates, and it hides itself once the signup flow is on screen: two
 * competing "Get listed" buttons at the moment of commitment is a way to
 * lose the click, not win it.
 */
export function StickyMobileCta({
  href,
  spotsRemaining,
}: {
  href: string;
  /** null once the places are gone, so the bar stops advertising them
   * rather than showing a zero next to a Claim button. */
  spotsRemaining: number | null;
}) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Far enough that the hero CTA has left the viewport on a phone, rather
    // than the bar racing the button it is meant to replace.
    const THRESHOLD = 520;
    const onScroll = () => setShown(window.scrollY > THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-transform duration-200 md:hidden ${
        shown ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ backgroundColor: "rgba(255,255,255,0.94)", borderColor: "#CCC3D8", backdropFilter: "blur(8px)" }}
      // Kept mounted but pushed off-screen so the transition can run; hidden
      // from assistive tech and from tab order while it is off-screen.
      aria-hidden={!shown}
      {...(!shown ? { inert: "" as unknown as boolean } : {})}
    >
      {/* The count sits above the button rather than inside it: a coach
          decides on the offer, then presses. Putting a number on the button
          makes the button harder to read at a glance, which is the one job
          it has on a phone. */}
      {spotsRemaining != null && (
        <p className="mb-2 text-center text-[11px] font-medium" style={{ color: "#4A4455" }}>
          Only {spotsRemaining} Founding Coach {spotsRemaining === 1 ? "spot" : "spots"} remaining
        </p>
      )}
      <TrackedCta
        href={href}
        event="founding_cta_click"
        props={{ foundingSpotsRemaining: spotsRemaining ?? 0, placement: "sticky" }}
        className="flex w-full items-center justify-center rounded-full px-6 py-4 text-[16px] font-medium text-white"
        style={{ backgroundColor: "#630ED4" }}
      >
        Claim my Founding Coach spot
      </TrackedCta>
    </div>
  );
}
