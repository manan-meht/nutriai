import Link from "next/link";
import { CLUB_TOKENS as T } from "./tokens";
import { formatMoney, CLUB_MARKET } from "@/lib/club/config";

// Session detail. The post-session workflow is meant to take under a
// minute (spec), so the notes fields are plain and always visible rather
// than hidden behind an edit mode.

const fmt = new Intl.DateTimeFormat("en-SG", {
  timeZone: CLUB_MARKET.timezone,
  weekday: "long", day: "numeric", month: "long",
  hour: "numeric", minute: "2-digit", hour12: true,
});

export function SessionDetail({
  booking,
  notes,
}: {
  booking: {
    id: string; startsAt: string; endsAt: string; status: string; priceCents: number;
    clientName: string; clientProfileId: string; serviceName: string | null;
    clientNote: string | null; locationLabel: string | null; locationType: string | null;
  };
  notes: { privateNotes: string; sharedSummary: string; suggestedNextSession: string };
}) {
  const done = booking.status === "COMPLETED";
  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <section className="rounded-2xl border p-5 md:p-6" style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
        <dl className="flex flex-col gap-3 text-sm">
          <Row label="When" value={fmt.format(new Date(booking.startsAt))} />
          <Row label="Service" value={booking.serviceName ?? "Session"} />
          <Row label="Where" value={booking.locationType === "ONLINE" ? "Online" : booking.locationLabel ?? "—"} />
          <Row label="Price" value={formatMoney(booking.priceCents)} />
          <Row label="Status" value={booking.status.replaceAll("_", " ").toLowerCase()} />
          <Row
            label="Client"
            value={
              <Link href={`/clients/${booking.clientProfileId}`} style={{ color: T.primary }}>
                {booking.clientName}
              </Link>
            }
          />
        </dl>
        {booking.clientNote && (
          <p className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: T.surfaceContainerLow }}>
            <span className="font-medium">Note from {booking.clientName.split(" ")[0]}: </span>
            {booking.clientNote}
          </p>
        )}
      </section>

      <section className="rounded-2xl border p-5 md:p-6" style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Session notes</h2>
        <p className="mt-1 text-sm" style={{ color: T.onSurfaceVariant }}>
          {done ? "Recorded after this session." : "You'll be able to record these once the session is complete."}
        </p>
        <dl className="mt-5 flex flex-col gap-4 text-sm">
          <NoteBlock label="Private notes" hint="Only you can see these" value={notes.privateNotes} />
          <NoteBlock label="Shared with client" value={notes.sharedSummary} />
          <NoteBlock label="Suggested next session" value={notes.suggestedNextSession} />
        </dl>
        {/* Completion and progress recording arrive with the session
            workflow; the booking state machine already refuses any
            transition attempted from here in the meantime. */}
        <p className="mt-5 text-xs" style={{ color: T.onSurfaceVariant }}>
          Marking sessions complete and recording progress is coming next.
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt style={{ color: T.onSurfaceVariant }}>{label}</dt>
      <dd className="text-right font-medium capitalize">{value}</dd>
    </div>
  );
}

function NoteBlock({ label, hint, value }: { label: string; hint?: string; value: string }) {
  return (
    <div>
      <dt className="font-medium">
        {label}
        {hint && <span className="ml-2 text-xs font-normal" style={{ color: T.onSurfaceVariant }}>{hint}</span>}
      </dt>
      <dd className="mt-1" style={{ color: value ? T.onSurface : T.onSurfaceVariant }}>
        {value || "Nothing recorded yet."}
      </dd>
    </div>
  );
}
