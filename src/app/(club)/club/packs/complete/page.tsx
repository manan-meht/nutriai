import Link from "next/link";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { settlePackFromCheckoutSession } from "@/lib/club/pack-purchases";
import { ClubChrome } from "@/components/club/ClubChrome";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { formatMoney } from "@/lib/club/config";

// Where Stripe returns a client after buying a class pack.
//
// The session is read back from Stripe rather than trusting the redirect —
// a success_url can be visited directly, so arriving here is not proof of
// payment. Settling here as well as in the webhook means the credits exist
// by the time this page renders, instead of appearing whenever the webhook
// happens to land.

export const dynamic = "force-dynamic";

export default async function PackCompletePage({
  searchParams,
}: {
  searchParams?: Promise<{ session_id?: string }>;
}) {
  const sessionId = (await searchParams)?.session_id;
  if (!sessionId) redirect("/");

  const admin = createServiceClient();
  const result = await settlePackFromCheckoutSession(admin, sessionId).catch(() => null);

  if (!result?.ok || !result.purchaseId) {
    return (
      <ClubChrome hideNav>
        <h1 className="text-2xl font-semibold tracking-[-0.01em]">We couldn&rsquo;t confirm that payment</h1>
        <p className="mt-3 text-[15px]" style={{ color: T.onSurfaceVariant }}>
          {result?.message ?? "Something went wrong."} If you were charged, your classes will appear
          shortly — nothing is lost.
        </p>
        <Link href="/bookings" className="mt-6 inline-flex text-[15px] font-semibold" style={{ color: T.primary }}>
          Go to my bookings
        </Link>
      </ClubChrome>
    );
  }

  const { data: purchase } = await admin
    .from("club_pack_purchases")
    .select("classes_total, classes_used, price_cents, currency, expires_at, coach_profile_id, service_id")
    .eq("id", result.purchaseId)
    .maybeSingle();

  const [{ data: coach }, { data: service }] = await Promise.all([
    admin.from("coach_profiles").select("display_name").eq("id", purchase?.coach_profile_id).maybeSingle(),
    admin.from("coach_services").select("name").eq("id", purchase?.service_id).maybeSingle(),
  ]);

  const remaining = (purchase?.classes_total ?? 0) - (purchase?.classes_used ?? 0);

  return (
    <ClubChrome hideNav>
      <div className="mx-auto max-w-md rounded-3xl border p-8 text-center" style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}>
        <p className="text-4xl" aria-hidden="true">🎟️</p>
        <h1 className="mt-4 text-2xl font-semibold tracking-[-0.01em]">Your classes are ready</h1>
        <p className="mt-3 text-[15px] leading-7" style={{ color: T.onSurfaceVariant }}>
          <strong style={{ color: T.onSurface }}>{remaining} {service?.name ?? "classes"}</strong> with{" "}
          {coach?.display_name}. Book them whenever suits you — no need to pay again.
        </p>
        {purchase?.expires_at && (
          <p className="mt-2 text-[13px]" style={{ color: T.onSurfaceVariant }}>
            Use them by {new Date(purchase.expires_at).toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" })}.
          </p>
        )}
        <p className="mt-2 text-[13px]" style={{ color: T.onSurfaceVariant }}>
          Paid {formatMoney(purchase?.price_cents ?? 0, purchase?.currency ?? undefined)}
        </p>
        <Link
          href={`/coaches/${purchase?.coach_profile_id}`}
          className="mt-6 inline-flex rounded-full px-6 py-3 text-[15px] font-semibold"
          style={{ backgroundColor: T.primary, color: T.onPrimary }}
        >
          Book your first class
        </Link>
      </div>
    </ClubChrome>
  );
}
