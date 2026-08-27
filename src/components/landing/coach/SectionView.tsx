"use client";

import { useEffect, useRef } from "react";
import { track, type LandingEvent, type LandingEventProps } from "@/lib/landing/track";

/** Reports that a section was actually seen, once.
 *
 * A click event tells you what someone did; a view event tells you what
 * they got as far as. Without the second, "nobody clicked the pricing CTA"
 * and "nobody ever reached the pricing section" look identical, and they
 * need opposite fixes.
 *
 * IntersectionObserver rather than scroll depth, because section heights
 * change every time the copy does — a pixel threshold measured today is
 * measuring something else next week. Disconnects after firing: the number
 * worth having is how many people reached a section, not how many times
 * they scrolled past it.
 */
export function SectionView({
  event,
  props,
  children,
  className,
  id,
}: {
  event: LandingEvent;
  props?: LandingEventProps;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || fired.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        // A quarter visible, not a single pixel: a section clipping the
        // bottom of the viewport for a moment was not read.
        if (!entry.isIntersecting || fired.current) return;
        fired.current = true;
        track(event, props);
        observer.disconnect();
      },
      { threshold: 0.25 }
    );
    observer.observe(el);
    return () => observer.disconnect();
    // props is intentionally not a dependency — re-firing on an unrelated
    // re-render would inflate the count this exists to measure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  return (
    <div ref={ref} className={className} id={id}>
      {children}
    </div>
  );
}
