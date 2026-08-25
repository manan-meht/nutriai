"use client";

import Link from "next/link";
import { useRef } from "react";
import { track, type LandingEvent } from "@/lib/landing/track";

/** A CTA that reports itself before navigating.
 *
 * Every "Get listed for free" on the page routes through here, so the four
 * placements can be told apart in Ads — the nav CTA converting and the hero
 * CTA not is a different problem from nobody clicking at all.
 *
 * The ref guard exists because a click can produce more than one event: a
 * double tap on mobile, or a fast second click while the next page is still
 * loading. Without it the same coach counts twice and the click-through
 * figures quietly inflate.
 */
export function TrackedCta({
  href,
  event,
  children,
  className,
  style,
  scroll,
}: {
  href: string;
  event: LandingEvent;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Passed through for in-page anchors that should scroll smoothly. */
  scroll?: boolean;
}) {
  const fired = useRef(false);

  return (
    <Link
      href={href}
      scroll={scroll}
      className={className}
      style={style}
      onClick={(e) => {
        if (fired.current) return;
        fired.current = true;
        track(event);

        // In-page anchors scroll smoothly. Done here rather than with a
        // global `scroll-behavior: smooth` on <html>, which would also
        // apply to Tistra Health's pages, and which cannot be conditioned
        // on the visitor's motion preference.
        if (href.startsWith("#")) {
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
            // Keep the URL honest without letting the browser jump.
            window.history.replaceState(null, "", href);
          }
        }
        // Released shortly after, so an in-page anchor (which does not
        // unmount this component) can still be measured if clicked again
        // later in the session.
        window.setTimeout(() => {
          fired.current = false;
        }, 1000);
      }}
    >
      {children}
    </Link>
  );
}
