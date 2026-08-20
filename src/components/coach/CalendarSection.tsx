"use client";

import { useState, useTransition } from "react";
import { disconnectCoachCalendar } from "@/app/(coach)/coach/actions";
import { CLUB_TOKENS as T } from "./tokens";
import type { CalendarConnectionState } from "@/lib/club/calendar";

// Google Calendar connection.
//
// The promise made here is narrow and worth stating plainly to the coach:
// Tistra reads only busy TIMES. The scope requested is free/busy, so event
// titles, attendees and locations are never sent to us at all — a coach
// deciding whether to connect their personal calendar deserves to know
// that it is a technical guarantee, not a policy we're asking them to
// trust us on.

const COPY: Record<
  CalendarConnectionState["status"],
  { label: string; tone: "ok" | "wait" | "bad" }
> = {
  connected: { label: "Connected", tone: "ok" },
  not_connected: { label: "Not connected", tone: "wait" },
  needs_reauth: { label: "Reconnect needed", tone: "bad" },
  revoked: { label: "Access revoked", tone: "bad" },
  error: { label: "Not connected", tone: "wait" },
};

export function CalendarSection({ state }: { state: CalendarConnectionState }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[state.status];
  const tone = copy.tone === "ok" ? T.success : copy.tone === "bad" ? T.error : T.warning;

  return (
    <section
      className="rounded-2xl border p-5"
      style={{ backgroundColor: T.surfaceContainerLowest, borderColor: T.outlineVariant }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Calendar</h2>
          <p className="mt-1 max-w-xl text-sm" style={{ color: T.onSurfaceVariant }}>
            Connect Google Calendar and Tistra will stop offering times you&rsquo;re already busy.
          </p>
        </div>
        <span
          className="shrink-0 rounded-full px-3 py-1 text-xs font-medium"
          style={{ backgroundColor: T.surfaceContainerLow, color: tone }}
        >
          {copy.label}
        </span>
      </div>

      <p className="mt-4 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: T.surfaceContainerLow }}>
        We only ever see <strong>busy times</strong> — never event names, guests or locations. Google
        isn&rsquo;t asked for them, so they never reach us.
      </p>

      {!state.configured ? (
        <p className="mt-4 text-sm" style={{ color: T.onSurfaceVariant }}>
          Calendar sync isn&rsquo;t switched on for this environment yet.
        </p>
      ) : (
        <>
          {state.email && (
            <p className="mt-3 text-sm" style={{ color: T.onSurfaceVariant }}>
              {state.status === "connected" ? "Reading busy times from" : "Was connected to"}{" "}
              <span style={{ color: T.onSurface }}>{state.email}</span>
              {state.lastSyncedAt && state.status === "connected" && (
                <> · last checked {new Date(state.lastSyncedAt).toLocaleString("en-SG")}</>
              )}
            </p>
          )}

          {state.status === "needs_reauth" && (
            <p className="mt-3 text-sm" style={{ color: T.error }}>
              Google stopped accepting our access, so your calendar isn&rsquo;t being checked. Reconnect
              to keep those times blocked.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* A plain link, not a form: this leaves for Google's consent
                screen and must be a normal navigation. */}
            <a
              href="/api/coach/calendar/start"
              className="rounded-full px-5 py-2.5 text-sm font-medium"
              style={{ backgroundColor: T.primary, color: T.onPrimary }}
            >
              {state.status === "connected" ? "Reconnect" : "Connect Google Calendar"}
            </a>

            {state.status !== "not_connected" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setError(null);
                  start(async () => {
                    const r = await disconnectCoachCalendar();
                    if (!r.ok) setError(r.error);
                  });
                }}
                className="rounded-full border px-5 py-2.5 text-sm font-medium disabled:opacity-60"
                style={{ borderColor: T.outlineVariant }}
              >
                {pending ? "Disconnecting…" : "Disconnect"}
              </button>
            )}
          </div>
        </>
      )}

      {error && <p className="mt-3 text-sm" style={{ color: T.error }}>{error}</p>}
    </section>
  );
}
