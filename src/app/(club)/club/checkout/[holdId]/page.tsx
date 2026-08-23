import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ClubChrome, StickyAction } from "@/components/club/ClubChrome";
import { HoldCountdown } from "@/components/club/HoldCountdown";
import { payAction, startBookingCheckout, releaseHoldAction, payWithPackAction } from "../../actions";
import { usablePacks } from "@/lib/club/pack-purchases";
import { stripeCheckoutConfigured } from "@/lib/club/checkout-session";
import { headers } from "next/headers";
import { isLocalDevHost } from "@/lib/club/host";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { formatMoney, CLUB_MARKET } from "@/lib/club/config";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone,
  weekday: "long", day: "numeric", month: "long",
  hour: "numeric", minute: "2-digit", hour12: true,
});

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ holdId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { holdId } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?product=club&next=${encodeURIComponent(`/checkout/${holdId}`)}`);

  const admin = createServiceClient();
  const { data: hold } = await admin
    .from("booking_holds")
    .select("id, coach_profile_id, client_profile_id, service_id, starts_at, ends_at, expires_at, released_at, booking_id")
    .eq("id", holdId)
    .maybeSingle();

  // Someone else's hold is indistinguishable from a missing one here.
  if (!hold || hold.client_profile_id !== user.id) redirect("/");
  if (hold.booking_id) redirect(`/bookings/${hold.booking_id}`);
  if (hold.released_at || new Date(hold.expires_at) <= new Date()) {
    redirect(`/coaches/${hold.coach_profile_id}/book?service=${hold.service_id}&error=gone`);
  }

  const [{ data: coach }, { data: service }] = await Promise.all([
    admin.from("coach_profiles").select("display_name, cancellation_full_refund_hours, stripe_account_id, stripe_payouts_enabled").eq("id", hold.coach_profile_id).maybeSingle(),
    admin.from("coach_services").select("name, duration_minutes, price_cents, currency").eq("id", hold.service_id).maybeSingle(),
  ]);
  if (!coach || !service) redirect("/");

  const live = stripeCheckoutConfigured() && !!coach.stripe_account_id && coach.stripe_payouts_enabled;
  // Scheme comes from the request, not a constant. Hardcoding https sent
  // Stripe's return URL to https://localhost:3001, which has no TLS — the
  // payment succeeded and the client landed on a browser error.
  // Classes this client has already paid for against THIS service. Empty
  // for almost everyone, so the paid flow below is untouched.
  const credits = await usablePacks(admin, {
    clientProfileId: hold.client_profile_id,
    serviceId: hold.service_id,
  }).catch(() => []);
  const creditsLeft = credits.reduce((n, p) => n + (p.classesTotal - p.classesUsed), 0);

  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "tistra.club";
  const proto = requestHeaders.get("x-forwarded-proto") ?? (isLocalDevHost(host) ? "http" : "https");
  const origin = `${proto}://${host}`;

  return (
    <ClubChrome hideNav>
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">Confirm and pay</h1>
      <HoldCountdown expiresAt={hold.expires_at} />

      {error && (
        <p role="alert" className="mt-4 rounded-xl px-4 py-3 text-sm"
           style={{ backgroundColor: T.errorContainer, color: T.onErrorContainer }}>
          {decodeURIComponent(error)}
        </p>
      )}

      <section className="mt-5 rounded-2xl border p-5" style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
        <p className="text-lg font-medium">{service.name}</p>
        <p className="mt-1 text-sm" style={{ color: T.onSurfaceVariant }}>with {coach.display_name}</p>
        <p className="mt-3 font-medium">{when.format(new Date(hold.starts_at))}</p>
        <p className="mt-0.5 text-sm" style={{ color: T.onSurfaceVariant }}>{service.duration_minutes} minutes · Singapore time</p>
      </section>

      <section className="mt-4 rounded-2xl border p-5" style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
        <div className="flex items-center justify-between text-sm">
          <span style={{ color: T.onSurfaceVariant }}>Session</span>
          <span>{formatMoney(service.price_cents, service.currency)}</span>
        </div>
        <div className="mt-3 flex items-center justify-between border-t pt-3 font-semibold" style={{ borderColor: T.outlineVariant }}>
          <span>Total</span>
          <span>{formatMoney(service.price_cents, service.currency)}</span>
        </div>
        <p className="mt-3 text-xs" style={{ color: T.onSurfaceVariant }}>
          Free cancellation up to {coach.cancellation_full_refund_hours} hours before the session.
          The exact meeting location is shared once the booking is confirmed.
        </p>
      </section>

      {creditsLeft > 0 && (
        <form action={payWithPackAction} className="mt-4 rounded-2xl border p-4" style={{ borderColor: T.primary }}>
          <input type="hidden" name="holdId" value={hold.id} />
          <p className="text-sm font-medium">
            You have {creditsLeft} {creditsLeft === 1 ? "class" : "classes"} left in your pack
          </p>
          <p className="mt-1 text-sm" style={{ color: T.onSurfaceVariant }}>
            Use one for this session — nothing more to pay.
          </p>
          <button
            type="submit"
            className="mt-3 w-full rounded-full py-3.5 text-[15px] font-medium"
            style={{ backgroundColor: T.primary, color: T.onPrimary }}
          >
            Use 1 class from my pack
          </button>
        </form>
      )}

      {/* Real payment when Stripe is configured and the coach can be paid;
          the mock only runs in development, and says so rather than looking
          like a completed purchase. */}
      <form action={live ? startBookingCheckout : payAction} className="mt-4">
        <input type="hidden" name="holdId" value={hold.id} />
        <input type="hidden" name="origin" value={origin} />
        <label htmlFor="clientNote" className="text-sm font-medium">Anything your coach should know?</label>
        <textarea
          id="clientNote" name="clientNote" rows={3}
          placeholder="Injuries, goals, experience level — optional"
          className="mt-2 w-full rounded-xl border p-3 text-sm"
          style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant, color: T.onSurface }}
        />
        <StickyAction>
          <button
            type="submit"
            className="w-full rounded-full py-4 text-[15px] font-medium"
            style={
              creditsLeft > 0
                ? { backgroundColor: T.surfaceContainerLowest, color: T.onSurface, border: `1px solid ${T.outlineVariant}` }
                : { backgroundColor: T.primary, color: T.onPrimary }
            }
          >
            {creditsLeft > 0 ? "Pay separately instead — " : live ? "Pay " : "Pay (test mode) "}
            {formatMoney(service.price_cents, service.currency)}
          </button>
          {!live && (
            <p className="mt-2 text-center text-xs" style={{ color: T.warning }}>
              No card will be charged — payments aren&rsquo;t live for this coach yet.
            </p>
          )}
        </StickyAction>
      </form>

      <form action={releaseHoldAction} className="mt-6 text-center">
        <input type="hidden" name="holdId" value={hold.id} />
        <button type="submit" className="text-sm underline" style={{ color: T.onSurfaceVariant }}>
          Cancel and release this time
        </button>
      </form>
    </ClubChrome>
  );
}
