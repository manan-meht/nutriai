import { FREE_BOOKINGS } from "@/lib/landing/coach-market";

/** Carries the offer across the click into signup.
 *
 * A coach who presses "Claim my Founding Coach spot" and lands on a bare
 * email/password form has to wonder whether the offer came with them. That
 * doubt is enough to lose someone who was otherwise ready, and it costs one
 * card to remove.
 *
 * Shown only when signup was reached from the coach landing, so it cannot
 * appear on a Health or Club signup where it would be nonsense.
 */
export function FoundingCoachBanner({ needsHelp }: { needsHelp?: boolean }) {
  return (
    <div
      className="mb-6 rounded-2xl border p-4"
      style={{ borderColor: "#CCC3D8", backgroundColor: "#EDE0FF" }}
    >
      <p className="text-[14px] font-semibold" style={{ color: "#1A1B22" }}>
        You&rsquo;re joining as a Founding Coach
      </p>
      <p className="mt-1 text-[13px] leading-5" style={{ color: "#4A4455" }}>
        0% commission on your first {FREE_BOOKINGS} bookings + promotional support from Tistra.
      </p>
      {needsHelp && (
        <p className="mt-2 text-[13px] leading-5 font-medium" style={{ color: "#4F0BAA" }}>
          We&rsquo;ll help you build your profile — we&rsquo;ll be in touch after you sign up.
        </p>
      )}
    </div>
  );
}
