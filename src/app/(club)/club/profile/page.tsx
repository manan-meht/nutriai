import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ClubChrome } from "@/components/club/ClubChrome";
import { CLUB_TOKENS as T } from "@/components/coach/tokens";
import { CLUB_BRANDING } from "@/lib/club/config";

export const dynamic = "force-dynamic";

export default async function ClubProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?product=club&next=%2Fclub%2Fprofile");

  const admin = createServiceClient();
  const [{ data: profile }, { count: bookingCount }, { data: favourites }] = await Promise.all([
    admin.from("profiles").select("full_name, email").eq("id", user.id).maybeSingle(),
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("client_profile_id", user.id),
    admin.from("favourite_coaches").select("coach_profile_id, coach_profiles(display_name, headline)").eq("client_profile_id", user.id),
  ]);

  const name = profile?.full_name?.trim() || "there";

  return (
    <ClubChrome active="profile">
      <h1 className="text-2xl font-semibold tracking-[-0.01em]">Hi, {name.split(" ")[0]}</h1>
      <p className="mt-1 text-sm" style={{ color: T.onSurfaceVariant }}>{profile?.email ?? user.email}</p>

      <dl className="mt-6 grid grid-cols-2 gap-3">
        <Stat label="Sessions booked" value={String(bookingCount ?? 0)} />
        <Stat label="Saved coaches" value={String(favourites?.length ?? 0)} />
      </dl>

      {favourites && favourites.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: T.onSurfaceVariant }}>Saved</h2>
          <ul className="flex flex-col gap-2">
            {favourites.map((f: any) => {
              const c = Array.isArray(f.coach_profiles) ? f.coach_profiles[0] : f.coach_profiles;
              return (
                <li key={f.coach_profile_id}>
                  <Link href={`/club/coaches/${f.coach_profile_id}`} className="block rounded-2xl border p-4"
                        style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
                    <p className="font-medium">{c?.display_name}</p>
                    <p className="mt-0.5 text-sm" style={{ color: T.onSurfaceVariant }}>{c?.headline}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <section className="mt-8 rounded-2xl border p-5" style={{ borderColor: T.outlineVariant }}>
        <h2 className="font-medium">Nutrition tracking</h2>
        <p className="mt-1 text-sm" style={{ color: T.onSurfaceVariant }}>
          {CLUB_BRANDING.productName} bookings and Tistra Health nutrition tracking are separate.
          Nothing about your meals is shared with a coach unless you turn sharing on for that coach.
        </p>
      </section>

      <div className="mt-8 flex flex-col items-start gap-3 text-sm">
        <Link href="/privacy" style={{ color: T.onSurfaceVariant }}>Privacy</Link>
        <Link href="/terms" style={{ color: T.onSurfaceVariant }}>Terms</Link>
        {/* Sign-out is a POST, not a link — a GET to /auth/signout is a 405. */}
        <form action="/auth/signout" method="post">
          <input type="hidden" name="redirectTo" value="/club" />
          <button type="submit" style={{ color: T.error }}>Sign out</button>
        </form>
      </div>
    </ClubChrome>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: T.surfaceContainerLow }}>
      <dt className="text-xs" style={{ color: T.onSurfaceVariant }}>{label}</dt>
      <dd className="mt-0.5 text-xl font-semibold">{value}</dd>
    </div>
  );
}
