import Link from "next/link";
import { CLUB_TOKENS as T } from "./tokens";
import { CoachPageHeader } from "./CoachShell";
import { CLUB_MARKET } from "@/lib/club/config";
import type { CoachClientRow } from "@/lib/club/coach-queries";

const dateFmt = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone,
  day: "numeric",
  month: "short",
});

/** Days since a session, used only to decide whether to nudge — deliberately
 * coarse, since "3 weeks ago" is the useful signal, not "19 days". */
function weeksSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (7 * 864e5));
}

export function CoachClients({ clients }: { clients: CoachClientRow[] }) {
  const lapsed = clients.filter((c) => !c.nextSessionAt && (weeksSince(c.lastSessionAt) ?? 0) >= 3);

  return (
    <>
      <CoachPageHeader eyebrow={`${clients.length} ${clients.length === 1 ? "client" : "clients"}`} title="Clients" />

      {clients.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed px-6 py-12 text-center"
          style={{ borderColor: T.outlineVariant }}
        >
          <p className="text-[15px] font-medium">No clients yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: T.onSurfaceVariant }}>
            Clients appear here automatically after their first booking. Make sure your profile
            is published so people can find you.
          </p>
          <Link
            href="/coach/settings"
            className="mt-6 inline-flex rounded-full px-6 py-3 text-sm font-medium"
            style={{ backgroundColor: T.primary, color: T.onPrimary }}
          >
            Check my profile
          </Link>
        </div>
      ) : (
        <>
          {/* Retention prompt: the highest-value action on this screen is
              re-engaging someone who has drifted, not admiring the list. */}
          {lapsed.length > 0 && (
            <div
              className="mb-6 rounded-2xl border p-5"
              style={{ backgroundColor: T.primaryContainer, borderColor: "transparent" }}
            >
              <p className="text-[15px] font-medium">
                {lapsed.length} {lapsed.length === 1 ? "client hasn't" : "clients haven't"} booked in a while
              </p>
              <p className="mt-1.5 text-sm" style={{ color: T.onSurfaceVariant }}>
                {lapsed.map((c) => c.name).slice(0, 3).join(", ")}
                {lapsed.length > 3 ? ` and ${lapsed.length - 3} more` : ""} — no upcoming session booked.
              </p>
            </div>
          )}

          <ul className="flex flex-col gap-3">
            {clients.map((c) => (
              <li
                key={c.clientProfileId}
                className="rounded-2xl border p-4 md:p-5"
                style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {c.name}
                      {c.nutritionSharingEnabled && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ backgroundColor: T.successContainer, color: T.success }}
                          title="This client has chosen to share their nutrition summary with you"
                        >
                          Nutrition shared
                        </span>
                      )}
                    </p>
                    <p className="mt-1 text-sm" style={{ color: T.onSurfaceVariant }}>
                      {c.sessionCount} {c.sessionCount === 1 ? "session" : "sessions"}
                      {c.lastSessionAt && ` · last ${dateFmt.format(new Date(c.lastSessionAt))}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.nextSessionAt ? (
                      <span
                        className="rounded-full px-3 py-1.5 text-xs font-medium"
                        style={{ backgroundColor: T.surfaceContainer }}
                      >
                        Next {dateFmt.format(new Date(c.nextSessionAt))}
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: T.onSurfaceVariant }}>
                        No upcoming session
                      </span>
                    )}
                    <Link
                      href={`/coach/clients/${c.clientProfileId}`}
                      className="rounded-full border px-4 py-2 text-sm font-medium"
                      style={{ borderColor: T.outlineVariant }}
                    >
                      View
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
