import type { FoundingSpots as Spots } from "@/lib/landing/founding-spots";

/** "Only 16 Founding Coach spots remaining", from a real count.
 *
 * The number comes from how many coaches have actually claimed a place, and
 * the limit is how many we can personally onboard and promote. There is no
 * timer and no invented figure — the scarcity is a fact about our capacity,
 * and stating it as anything else would be the kind of thing a professional
 * spots immediately.
 *
 * Renders nothing when the places are gone rather than showing "0 spots
 * remaining" beside a Claim button.
 */
export function FoundingSpotsLine({
  spots,
  tone = "default",
  className = "",
}: {
  spots: Spots;
  /** "subtle" for the sticky bar and nav, where this sits beside a button
   * and must not compete with it. "dark" for the black coach homepage,
   * where #630ED4 is unreadable and the light lavender accent is used
   * instead. */
  tone?: "default" | "subtle" | "dark";
  className?: string;
}) {
  if (!spots.available) return null;

  const strong = tone !== "subtle";
  const color = tone === "dark" ? "#D2BBFF" : strong ? "#630ED4" : "#4A4455";
  return (
    <p
      className={`${strong ? "text-[13px] font-semibold" : "text-[11px] font-medium"} ${className}`}
      style={{ color }}
    >
      <span aria-hidden="true">●</span> Only {spots.remaining} Founding Coach{" "}
      {spots.remaining === 1 ? "spot" : "spots"} remaining
    </p>
  );
}

/** The reason for the limit, said plainly. Sits under the count wherever
 * the count is given room to breathe. */
export function FoundingSpotsReason({
  className = "",
  tone = "light",
}: {
  className?: string;
  tone?: "light" | "dark";
}) {
  return (
    <p className={`text-[13px] leading-5 ${className}`} style={{ color: tone === "dark" ? "#A1A1A1" : "#4A4455" }}>
      We&rsquo;re keeping the first group small because we&rsquo;re personally onboarding and
      promoting every Founding Coach.
    </p>
  );
}
