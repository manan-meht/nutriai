"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { track, type LandingEvent, type LandingEventProps } from "@/lib/landing/track";

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
  props,
  children,
  className,
  style,
  scroll,
}: {
  href: string;
  event: LandingEvent;
  /** Extra properties for this click — foundingSpotsRemaining, mostly, so a
   * click can be read against how scarce the offer looked at the time. */
  props?: LandingEventProps;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Passed through for in-page anchors that should scroll smoothly. */
  scroll?: boolean;
}) {
  const fired = useRef(false);
  const router = useRouter();

  /** Carries utm_ params, gclid and fbclid from the landing URL into signup.
   *
   * Merged at click time rather than at render: these pages are static, and
   * reading searchParams on the server would make every coach marketing
   * route dynamic — which costs an ads landing page the one thing it cannot
   * afford. The plain href stays on the anchor, so the link still works
   * without JS, and a modified click (new tab, cmd-click) is left entirely
   * to the browser.
   */
  function withCampaign(target: string): string {
    const incoming = new URLSearchParams(window.location.search);
    const carry = new URLSearchParams();
    for (const [k, v] of incoming) {
      if (k.startsWith("utm_") || k === "gclid" || k === "fbclid") carry.set(k, v);
    }
    if ([...carry].length === 0) return target;
    const [path, existing = ""] = target.split("?");
    const merged = new URLSearchParams(existing);
    for (const [k, v] of carry) if (!merged.has(k)) merged.set(k, v);
    return `${path}?${merged.toString()}`;
  }

  return (
    <Link
      href={href}
      scroll={scroll}
      className={className}
      style={style}
      onClick={(e) => {
        if (fired.current) return;
        fired.current = true;
        track(event, props);

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
        else if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
          const merged = withCampaign(href);
          if (merged !== href) {
            e.preventDefault();
            router.push(merged);
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
