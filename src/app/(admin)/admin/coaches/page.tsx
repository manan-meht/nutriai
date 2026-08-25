import Link from "next/link";
import { listCoaches, isReadyToPublish, outstanding, type AdminCoachRow } from "./data";

// Every coach on the platform, including the ones discovery hides.
//
// Built because answering "did anyone sign up, and where did they get stuck"
// meant querying the database by hand every time. The signal that matters is
// not the roster — it is which coaches stalled and on what, since a coach one
// step from publishing is the highest-probability conversion there is.

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Coaches | Tistra Admin",
  robots: { index: false, follow: false },
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const money = (cents: number) => `S$${(cents / 100).toFixed(0)}`;
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "published"
      ? { bg: "#E6F4EC", fg: "#0F7A4F" }
      : status === "draft"
        ? { bg: "#FBF2E0", fg: "#8A6116" }
        : { bg: "#F3F4F6", fg: "#4A5560" };
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
      style={{ backgroundColor: tone.bg, color: tone.fg }}
    >
      {status}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** The coach's own portrait, at the size it is actually judged at.
 *
 * Worth showing rather than linking: half of reviewing a roster is looking
 * at whether the photo is usable, and a URL cannot answer that. Cropped at
 * 35% from the top like the marketplace does — coach portraits put the face
 * in the upper third, so a centred crop takes the top of the head off. */
function Portrait({ c }: { c: AdminCoachRow }) {
  if (!c.photoUrl) {
    return (
      <div
        className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-sm font-semibold text-gray-400"
        title={c.blockers.photo ? "Photo uploaded but could not be signed" : "No photo uploaded"}
      >
        {initials(c.displayName) || "?"}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
    <img
      src={c.photoUrl}
      alt={`${c.displayName}'s profile photo`}
      loading="lazy"
      className="h-20 w-20 shrink-0 rounded-lg border border-gray-200 object-cover"
      style={{ objectPosition: "center 35%" }}
    />
  );
}

function CoachCard({ c }: { c: AdminCoachRow }) {
  const missing = outstanding(c.blockers);
  const ready = isReadyToPublish(c.blockers);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-4">
          <Portrait c={c} />
          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">{c.displayName}</h2>
            <StatusPill status={c.status} />
            {c.isDemo && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                demo
              </span>
            )}
          </div>
          {c.headline && <p className="mt-1 text-sm text-gray-600">{c.headline}</p>}
          <p className="mt-1 text-sm text-gray-500">
            {c.email ? (
              <a className="underline underline-offset-2 hover:text-gray-900" href={`mailto:${c.email}`}>
                {c.email}
              </a>
            ) : (
              "no email on file"
            )}
          </p>
          </div>
        </div>
        <div className="text-right text-xs text-gray-500">
          <p>signed up {day(c.createdAt)}</p>
          <p>last edit {day(c.updatedAt)}</p>
          <p>last login {day(c.lastSignInAt)}</p>
        </div>
      </div>

      {/* The reason this page exists: what is still in the way. */}
      {c.status !== "published" && (
        <div
          className="mt-4 rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: ready ? "#E6F4EC" : "#FBF2E0", color: ready ? "#0F7A4F" : "#8A6116" }}
        >
          {ready ? (
            <>Everything is done — this coach can publish right now.</>
          ) : (
            <>
              <span className="font-semibold">Stuck on:</span> {missing.join(", ")}
              {missing.length === 1 && missing[0] === "payouts" && (
                <> — one step from live. Stripe onboarding was started but never finished.</>
              )}
            </>
          )}
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Payouts</dt>
          <dd className={c.stripePayoutsEnabled ? "text-gray-900" : "font-semibold text-red-700"}>
            {c.stripePayoutsEnabled ? "enabled" : (c.stripeOnboardingStatus ?? "not started")}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Identity</dt>
          <dd className="text-gray-900">{c.identityStatus ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Free bookings</dt>
          <dd className="text-gray-900">
            {Math.max(0, c.foundingFreeBookings - c.foundingFreeUsed)} of {c.foundingFreeBookings} left
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-gray-500">Experience</dt>
          <dd className="text-gray-900">
            {c.yearsCoaching != null ? `${c.yearsCoaching} yrs` : "—"}
            {c.languages.length > 0 && ` · ${c.languages.join(", ")}`}
          </dd>
        </div>
      </dl>

      {c.bio && <p className="mt-4 whitespace-pre-line text-sm leading-6 text-gray-700">{c.bio}</p>}

      <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Skills ({c.skills.length})</p>
          <ul className="mt-1 text-gray-800">
            {c.skills.length === 0 && <li className="text-gray-400">none</li>}
            {c.skills.map((s) => (
              <li key={s.name}>
                {s.name}
                {s.isPrimary && <span className="text-gray-500"> · primary</span>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Services ({c.services.length})</p>
          <ul className="mt-1 text-gray-800">
            {c.services.length === 0 && <li className="text-gray-400">none</li>}
            {c.services.map((s, i) => (
              <li key={`${s.name}-${i}`} className={s.isActive ? "" : "text-gray-400 line-through"}>
                {s.name} — {money(s.priceCents)} / {s.durationMinutes}min
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Locations ({c.locations.length})</p>
          <ul className="mt-1 text-gray-800">
            {c.locations.length === 0 && <li className="text-gray-400">none</li>}
            {c.locations.map((l, i) => (
              <li key={i} className={l.isActive ? "" : "text-gray-400 line-through"}>
                {l.label || "(no label)"} — {l.neighbourhood ?? "—"} {l.postalCode ?? ""}
                {l.isPrimary && <span className="text-gray-500"> · primary</span>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Availability ({c.availability.length})</p>
          <ul className="mt-1 text-gray-800">
            {c.availability.length === 0 && <li className="text-gray-400">none</li>}
            {[...c.availability]
              .sort((a, b) => a.weekday - b.weekday)
              .map((a, i) => (
                <li key={i} className={a.isActive ? "" : "text-gray-400 line-through"}>
                  {DAYS[a.weekday]} {hhmm(a.startMinute)}–{hhmm(a.endMinute)}
                </li>
              ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm">
        {c.status === "published" && (
          <Link
            href={`https://tistra.club/coaches/${c.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-gray-900"
          >
            Public profile ↗
          </Link>
        )}
        {c.stripeAccountId && (
          <Link
            href={`https://dashboard.stripe.com/connect/accounts/${c.stripeAccountId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-gray-900"
          >
            Stripe account ↗
          </Link>
        )}
      </div>
    </section>
  );
}

export default async function AdminCoachesPage() {
  const all = await listCoaches();
  const real = all.filter((c) => !c.isDemo);
  const demo = all.filter((c) => c.isDemo);

  const published = real.filter((c) => c.status === "published");
  const unpublished = real.filter((c) => c.status !== "published");
  const oneStepAway = unpublished.filter((c) => outstanding(c.blockers).length === 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Coaches</h1>
        <p className="mt-1 text-sm text-gray-600">
          {real.length} real {real.length === 1 ? "coach" : "coaches"} · {published.length} published ·{" "}
          {unpublished.length} not live
          {oneStepAway.length > 0 && (
            <>
              {" "}
              · <span className="font-semibold text-amber-700">{oneStepAway.length} one step away</span>
            </>
          )}
          {demo.length > 0 && <> · {demo.length} demo hidden below</>}
        </p>
      </div>

      {/* Unpublished first, deliberately. A published coach needs nothing from
          anyone; an unpublished one is the only actionable row on the page. */}
      {unpublished.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Not live yet</h2>
          {unpublished.map((c) => (
            <CoachCard key={c.id} c={c} />
          ))}
        </div>
      )}

      {published.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Live</h2>
          {published.map((c) => (
            <CoachCard key={c.id} c={c} />
          ))}
        </div>
      )}

      {real.length === 0 && <p className="text-sm text-gray-600">No coaches have signed up yet.</p>}

      {demo.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700">
            Seeded demo coaches ({demo.length})
          </summary>
          <div className="mt-4 space-y-4">
            {demo.map((c) => (
              <CoachCard key={c.id} c={c} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
