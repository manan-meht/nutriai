/** The Founding Coach mark.
 *
 * Understated on purpose. It says someone was here early — it does not
 * imply better ranking, more bookings, or any functional advantage, because
 * it confers none, and a badge that over-promises devalues every other
 * claim on the page.
 *
 * Exported from the landing folder but written to be dropped onto a
 * marketplace coach card or profile header unchanged.
 */
export function FoundingBadge({
  size = "default",
  className = "",
}: {
  size?: "default" | "small";
  className?: string;
}) {
  const small = size === "small";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border ${
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      } font-semibold uppercase tracking-[0.06em] ${className}`}
      style={{ borderColor: "#CCC3D8", backgroundColor: "#FFFFFF", color: "#4F0BAA" }}
    >
      <svg
        width={small ? 9 : 11}
        height={small ? 9 : 11}
        viewBox="0 0 12 12"
        aria-hidden="true"
        fill="currentColor"
      >
        <path d="M6 0l1.6 3.5L11.4 4l-2.8 2.6.7 3.8L6 8.6 2.7 10.4l.7-3.8L.6 4l3.8-.5L6 0z" />
      </svg>
      Founding Coach
    </span>
  );
}
