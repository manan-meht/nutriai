import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ClubChrome } from "@/components/club/ClubChrome";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { formatMoney, CLUB_MARKET } from "@/lib/club/config";

export const dynamic = "force-dynamic";

const when = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone,
  weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
});

export default async function BookingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?product=club&next=%2Fclub%2Fbookings");

  const admin = createServiceClient();
  const { data } = await admin
    .from("bookings")
    .select("id, status, starts_at, price_cents, travel_fee_cents, currency, coach_profiles(display_name), coach_services(name)")
    .eq("client_profile_id", user.id)
    .order("starts_at", { ascending: false });

  const rows = data ?? [];
  const now = Date.now();
  const upcoming = rows.filter((r: any) => new Date(r.starts_at).getTime() >= now && ["CONFIRMED", "PAYMENT_PENDING"].includes(r.status));
  const past = rows.filter((r: any) => !upcoming.includes(r));

  return (
    <ClubChrome active="bookings">
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">Your bookings</h1>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border p-6 text-center" style={{ borderColor: T.outlineVariant }}>
          <p className="text-sm" style={{ color: T.onSurfaceVariant }}>No sessions yet.</p>
          <Link href="/club" className="mt-4 inline-block rounded-full px-5 py-2.5 text-sm font-medium"
                style={{ backgroundColor: T.primary, color: T.onPrimary }}>
            Find a coach
          </Link>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && <Section title="Upcoming" rows={upcoming} />}
          {past.length > 0 && <Section title="Past" rows={past} />}
        </>
      )}
    </ClubChrome>
  );
}

function Section({ title, rows }: { title: string; rows: any[] }) {
  return (
    <>
      <h2 className="mb-3 mt-7 text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: T.onSurfaceVariant }}>{title}</h2>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => {
          const coach = Array.isArray(r.coach_profiles) ? r.coach_profiles[0] : r.coach_profiles;
          const service = Array.isArray(r.coach_services) ? r.coach_services[0] : r.coach_services;
          return (
            <li key={r.id}>
              <Link href={`/club/bookings/${r.id}`} className="flex items-center justify-between gap-4 rounded-2xl border p-4"
                    style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
                <div className="min-w-0">
                  <p className="font-medium">{service?.name ?? "Session"}</p>
                  <p className="mt-0.5 truncate text-sm" style={{ color: T.onSurfaceVariant }}>
                    {coach?.display_name} · {when.format(new Date(r.starts_at))}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium" style={{ color: T.onSurfaceVariant }}>
                  {formatMoney(r.price_cents + (r.travel_fee_cents ?? 0), r.currency)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
