import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { settleFromCheckoutSession } from "@/lib/club/payments";
import { ClubChrome } from "@/components/club/ClubChrome";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";

// Where Stripe returns a client after paying.
//
// The session is read back from Stripe rather than trusting the redirect —
// a success_url can be visited directly, so arriving here is not proof of
// payment. Settling here as well as in the webhook means confirmation is
// instant for the client who waits, and still correct for the one who
// closes the tab; convertHoldToBooking is idempotent, so both is fine.
export const dynamic = "force-dynamic";

export default async function CheckoutCompletePage({
  params,
  searchParams,
}: {
  params: Promise<{ holdId: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { holdId } = await params;
  const { session_id: sessionId } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?product=club&next=${encodeURIComponent(`/checkout/${holdId}/complete`)}`);

  const admin = createServiceClient();

  if (sessionId) {
    const result = await settleFromCheckoutSession(admin, sessionId).catch(() => null);
    if (result?.ok) redirect(`/bookings/${result.bookingId}?new=1`);
  }

  // Paid but not settled yet, or arrived without a session id. The webhook
  // is the backstop, so this is a wait rather than a failure.
  const { data: hold } = await admin
    .from("booking_holds")
    .select("booking_id")
    .eq("id", holdId)
    .maybeSingle();
  if (hold?.booking_id) redirect(`/bookings/${hold.booking_id}?new=1`);

  return (
    <ClubChrome hideNav>
      <div className="py-16 text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">Confirming your booking…</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm" style={{ color: T.onSurfaceVariant }}>
          Your payment went through and we&rsquo;re finishing up. This page updates on its own.
        </p>
        {/* No JS needed, and it stops if the booking appears. */}
        <meta httpEquiv="refresh" content="3" />
      </div>
    </ClubChrome>
  );
}
