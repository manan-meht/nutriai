"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CLUB_TOKENS as T } from "./tokens";
import { CoachPhotoSection } from "./CoachPhotoSection";
import { CoachLocationMap } from "./CoachLocationMap";
import { AddressSearch } from "./AddressSearch";
import { BOUNDS, describeCancellationPolicy } from "@/lib/club/booking-preferences";
import { PayoutsSection, type PayoutState } from "./PayoutsSection";
import { CalendarSection } from "./CalendarSection";
import type { CalendarConnectionState } from "@/lib/club/calendar";
import { formatMoney, SG_NEIGHBOURHOODS, CLUB_MARKET } from "@/lib/club/config";
import {
  updateCoachProfile,
  setCoachSkills,
  upsertCoachService,
  setServiceActive,
  upsertCoachLocation,
  updateTravelRules,
  setAvailabilityRules,
  setCoachPublished,
  updateBookingPreferences,
  setPrimaryCoachLocation,
  deleteCoachLocation,
  addAvailabilityException,
  removeAvailabilityException,
} from "@/app/(coach)/coach/actions";

// Coach profile / onboarding. One page rather than a wizard: a returning
// coach editing their rate shouldn't have to walk six steps, and the
// publish checklist already tells a new coach what's still missing.
//
// Each section saves independently, so a slow or failed save in one place
// never discards work in another — losing a half-written bio because the
// services call failed would be the worst possible failure here.

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface SettingsData {
  profile: {
    displayName: string;
    headline: string | null;
    bio: string | null;
    yearsCoaching: number | null;
    languages: string[];
    status: string;
    photoUrl: string | null;
  };
  /** Signed URLs — the bucket is private, so these expire. */
  gallery: Array<{ id: string; url: string }>;
  payouts: PayoutState;
  calendar: CalendarConnectionState;
  timeOff: Array<{ id: string; startsAt: string; endsAt: string; reason: string | null }>;
  bookingPreferences: {
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minNoticeHours: number;
    maxAdvanceDays: number;
    cancellationFullRefundHours: number;
    cancellationPartialRefundPercent: number;
  };
  allSkills: Array<{ id: string; name: string; slug: string }>;
  selectedSkillIds: string[];
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    priceCents: number;
    isActive: boolean;
    travelEnabled: boolean;
    skillId: string | null;
  }>;
  locations: Array<{
    id: string;
    label: string;
    neighbourhood: string | null;
    addressIsPublic: boolean;
    isPrimary: boolean;
    latitude: number | null;
    longitude: number | null;
    addressLine: string | null;
    postalCode: string | null;
  }>;
  travel: { travelEnabled: boolean; maxTravelKm: number; travelBufferMinutes: number; serviceAreas: string[] } | null;
  availability: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  publishBlockers: string[];
}

const minutesToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export function CoachSettings({ data }: { data: SettingsData }) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PublishSection status={data.profile.status} blockers={data.publishBlockers} />
      <CoachPhotoSection photoUrl={data.profile.photoUrl} gallery={data.gallery} />
      <ProfileSection profile={data.profile} />
      <SkillsSection allSkills={data.allSkills} selectedIds={data.selectedSkillIds} />
      <ServicesSection services={data.services} skills={data.allSkills} />
      <LocationSection locations={data.locations} travel={data.travel} />
      <AvailabilitySection rules={data.availability} />
      <TimeOffSection entries={data.timeOff} />
      <BookingPreferencesSection preferences={data.bookingPreferences} />
      <CalendarSection state={data.calendar} />
      <PayoutsSection state={data.payouts} />
    </div>
  );
}

// ---- Sections --------------------------------------------------------

function PublishSection({ status, blockers }: { status: string; blockers: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [liveBlockers, setLiveBlockers] = useState(blockers);
  const published = status === "published";

  return (
    <Section
      title={published ? "Your profile is live" : "Publish your profile"}
      accent={!published}
      description={
        published
          ? "Clients searching your skills can find and book you."
          : "Finish these and you'll start appearing in search results."
      }
    >
      {!published && liveBlockers.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {liveBlockers.map((b) => (
            <li key={b} className="flex items-center gap-2.5 text-sm">
              <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border" style={{ borderColor: T.outline }} />
              {b}
            </li>
          ))}
        </ul>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      <Button
        pending={pending}
        variant={published ? "secondary" : "primary"}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await setCoachPublished(!published);
            if (!res.ok) {
              setError(res.error);
              if (res.blockers) setLiveBlockers(res.blockers);
              return;
            }
            // Only on the way IN. Pausing is not a conversion and must not
            // land on the "you're live" page — which would also fire the
            // Google Ads tag for a coach who just took themselves offline.
            if (!published) router.push("/settings/published");
          })
        }
      >
        {published ? "Pause my profile" : "Publish profile"}
      </Button>
    </Section>
  );
}

function ProfileSection({ profile }: { profile: SettingsData["profile"] }) {
  const [form, setForm] = useState({
    displayName: profile.displayName,
    headline: profile.headline ?? "",
    bio: profile.bio ?? "",
    yearsCoaching: profile.yearsCoaching?.toString() ?? "",
    languages: profile.languages.length > 0 ? profile.languages : ["English"],
  });
  const { pending, error, saved, save } = useSaver();

  return (
    <Section title="About you" description="This is what clients see first.">
      <Field label="Display name">
        <Input value={form.displayName} onChange={(v) => setForm({ ...form, displayName: v })} />
      </Field>
      <Field label="Headline" hint="e.g. Handstands & Acrobatics">
        <Input value={form.headline} onChange={(v) => setForm({ ...form, headline: v })} />
      </Field>
      <Field label="Introduction" hint="A short paragraph. What you coach, and who you love working with.">
        <textarea
          value={form.bio}
          onChange={(e) => setForm({ ...form, bio: e.target.value })}
          rows={5}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
          style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}
        />
      </Field>
      <Field label="Years coaching">
        <Input
          value={form.yearsCoaching}
          onChange={(v) => setForm({ ...form, yearsCoaching: v.replace(/\D/g, "") })}
          inputMode="numeric"
        />
      </Field>

      <LanguagesField
        selected={form.languages}
        onChange={(next) =>
          // Never let it reach empty: the public profile renders whatever
          // is here, and no languages at all reads as an error rather than
          // a choice.
          setForm({ ...form, languages: next.length > 0 ? next : ["English"] })
        }
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <SaveRow
        pending={pending}
        saved={saved}
        onSave={() =>
          save(() =>
            updateCoachProfile({
              displayName: form.displayName,
              headline: form.headline,
              bio: form.bio,
              yearsCoaching: form.yearsCoaching ? Number(form.yearsCoaching) : undefined,
              languages: form.languages,
            })
          )
        }
      />
    </Section>
  );
}

function SkillsSection({
  allSkills,
  selectedIds,
}: {
  allSkills: SettingsData["allSkills"];
  selectedIds: string[];
}) {
  const [selected, setSelected] = useState<string[]>(selectedIds);
  const { pending, error, saved, save } = useSaver();

  return (
    <Section title="Skills" description="What you coach. The first one you pick is your primary skill.">
      <div className="flex flex-wrap gap-2">
        {allSkills.map((s) => {
          const on = selected.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => setSelected(on ? selected.filter((x) => x !== s.id) : [...selected, s.id])}
              className="rounded-full border px-4 py-2 text-sm font-medium transition-colors"
              style={
                on
                  ? { backgroundColor: T.primary, color: T.onPrimary, borderColor: T.primary }
                  : { borderColor: T.outlineVariant, color: T.onSurfaceVariant }
              }
            >
              {s.name}
            </button>
          );
        })}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <SaveRow pending={pending} saved={saved} onSave={() => save(() => setCoachSkills(selected))} />
    </Section>
  );
}

function ServicesSection({
  services,
  skills,
}: {
  services: SettingsData["services"];
  skills: SettingsData["allSkills"];
}) {
  const [adding, setAdding] = useState(services.length === 0);
  const [draft, setDraft] = useState({ name: "", skillId: "", duration: "60", price: "70", travel: false });
  const { pending, error, save } = useSaver();
  const [, startToggle] = useTransition();

  return (
    <Section title="Services and Classes" description="What clients can book, and what it costs.">
      {services.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {services.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
              style={{ borderColor: T.outlineVariant, opacity: s.isActive ? 1 : 0.55 }}
            >
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs" style={{ color: T.onSurfaceVariant }}>
                  {s.durationMinutes} min · {formatMoney(s.priceCents)}
                  {s.travelEnabled ? " · travels to client" : ""}
                </p>
              </div>
              <button
                type="button"
                className="text-sm font-medium"
                style={{ color: T.primary }}
                onClick={() => startToggle(async () => { await setServiceActive(s.id, !s.isActive); })}
              >
                {s.isActive ? "Deactivate" : "Reactivate"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="flex flex-col gap-4 rounded-xl border p-4" style={{ borderColor: T.outlineVariant }}>
          <Field label="Service or Class name" hint="e.g. Handstand Foundations">
            <Input value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          </Field>
          <Field label="Skill">
            <select
              value={draft.skillId}
              onChange={(e) => setDraft({ ...draft, skillId: e.target.value })}
              className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
              style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}
            >
              <option value="">Select a skill</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Duration (min)">
              <Input value={draft.duration} onChange={(v) => setDraft({ ...draft, duration: v.replace(/\D/g, "") })} inputMode="numeric" />
            </Field>
            <Field label="Price (S$)">
              <Input value={draft.price} onChange={(v) => setDraft({ ...draft, price: v.replace(/[^\d.]/g, "") })} inputMode="decimal" />
            </Field>
          </div>
          <Checkbox
            checked={draft.travel}
            onChange={(v) => setDraft({ ...draft, travel: v })}
            label="I'll travel to the client for this"
          />
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex gap-3">
            <Button
              pending={pending}
              onClick={() =>
                save(async () => {
                  const res = await upsertCoachService({
                    name: draft.name,
                    skillId: draft.skillId || null,
                    durationMinutes: Number(draft.duration || 0),
                    // Prices are entered in dollars but stored as integer
                    // cents — rounding here, never later, keeps the ledger
                    // free of floats.
                    priceCents: Math.round(Number(draft.price || 0) * 100),
                    travelEnabled: draft.travel,
                    allowedLocationTypes: draft.travel
                      ? ["COACH_LOCATION", "CLIENT_LOCATION", "OUTDOOR"]
                      : ["COACH_LOCATION"],
                  });
                  if (res.ok) {
                    setDraft({ name: "", skillId: "", duration: "60", price: "70", travel: false });
                    setAdding(false);
                  }
                  return res;
                })
              }
            >
              Add service
            </Button>
            {services.length > 0 && (
              <Button variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
            )}
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>Add another</Button>
      )}
    </Section>
  );
}

/** Shared affordance for the per-location row actions. They sit in a row
 * of plain text, so without an underline they read as labels rather than
 * controls — which is exactly how "Make main" was missed. Disabled state
 * included, since these run server actions. */
const ROW_ACTION =
  "underline underline-offset-2 hover:no-underline disabled:opacity-50 disabled:no-underline " +
  "rounded focus-visible:outline-2 focus-visible:outline-offset-2";

type LocationDraft = SettingsData["locations"][number];

const BLANK_LOCATION: LocationDraft = {
  id: "",
  label: "",
  neighbourhood: "",
  addressIsPublic: false,
  isPrimary: false,
  latitude: null,
  longitude: null,
  addressLine: "",
  postalCode: "",
};

/** Where a coach works — one place or several.
 *
 * A list with ONE editor open at a time, rather than a card per location:
 * each editor carries a Google map, and mounting several would load the
 * Maps API repeatedly for places the coach isn't editing.
 */
function LocationSection({
  locations,
  travel,
}: {
  locations: SettingsData["locations"];
  travel: SettingsData["travel"];
}) {
  // Open the first location by default so a coach with one place sees the
  // form immediately, exactly as before this became a list.
  const [editingId, setEditingId] = useState<string | null>(locations[0]?.id ?? "new");
  const [draft, setDraft] = useState<LocationDraft>(locations[0] ?? BLANK_LOCATION);
  const [travelForm, setTravelForm] = useState({
    enabled: travel?.travelEnabled ?? false,
    maxKm: travel?.maxTravelKm?.toString() ?? "10",
    buffer: travel?.travelBufferMinutes?.toString() ?? "15",
    areas: travel?.serviceAreas ?? [],
  });
  const { pending, error, saved, save } = useSaver();
  const [busy, startBusy] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  const openEditor = (loc: LocationDraft | null) => {
    setRowError(null);
    setDraft(loc ?? BLANK_LOCATION);
    setEditingId(loc?.id ?? "new");
  };

  return (
    <Section title="Where you coach" description="Clients see your neighbourhood, never your exact address.">
      {locations.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {locations.map((loc) => (
            <li
              key={loc.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5"
              style={{
                borderColor: editingId === loc.id ? T.primary : T.outlineVariant,
                backgroundColor: T.surfaceContainerLowest,
              }}
            >
              <span className="min-w-0 text-sm">
                <span className="font-medium">{loc.label}</span>
                {loc.neighbourhood && (
                  <span style={{ color: T.onSurfaceVariant }}> · {loc.neighbourhood}</span>
                )}
                {loc.isPrimary && (
                  <span
                    className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: T.primaryContainer, color: T.primary }}
                  >
                    Main
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => openEditor(loc)}
                  className={ROW_ACTION}
                  aria-current={editingId === loc.id ? "true" : undefined}
                >
                  {editingId === loc.id ? "Editing" : "Edit"}
                </button>
                {!loc.isPrimary && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      startBusy(async () => {
                        const r = await setPrimaryCoachLocation(loc.id);
                        if (!r.ok) setRowError(r.error);
                      })
                    }
                    className={ROW_ACTION}
                    style={{ color: T.primary }}
                  >
                    Make main
                  </button>
                )}
                {locations.length > 1 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      startBusy(async () => {
                        setRowError(null);
                        const r = await deleteCoachLocation(loc.id);
                        if (!r.ok) setRowError(r.error);
                        else if (editingId === loc.id) openEditor(null);
                      })
                    }
                    className={ROW_ACTION}
                    style={{ color: T.error }}
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {rowError && <ErrorNote>{rowError}</ErrorNote>}

      {editingId !== "new" && (
        <button
          type="button"
          onClick={() => openEditor(null)}
          className="mb-4 self-start rounded-full border px-4 py-2 text-sm font-medium"
          style={{ borderColor: T.outlineVariant }}
        >
          + Add another location
        </button>
      )}

      <Field label="Location name (optional)" hint="Only useful if you coach from more than one place — e.g. River Valley studio">
        <Input value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} />
      </Field>

      <AddressSearch
        value={draft.addressLine ?? ""}
        onChange={(v) => setDraft((d) => ({ ...d, addressLine: v }))}
        onSelect={(r) =>
          setDraft((d) => ({
            ...d,
            latitude: r.latitude,
            longitude: r.longitude,
            addressLine: r.addressLine ?? d.addressLine,
            postalCode: r.postalCode ?? d.postalCode,
            neighbourhood: d.neighbourhood || r.neighbourhood || "",
          }))
        }
      />

      <Field label="Postal code">
        <Input value={draft.postalCode ?? ""} onChange={(v) => setDraft({ ...draft, postalCode: v })} inputMode="numeric" />
      </Field>

      {/* Coordinates drive travel-aware availability: without them the
          engine cannot tell whether a coach can physically reach a client
          between sessions, and correctly refuses to guess. */}
      <CoachLocationMap
        key={editingId ?? "new"}
        value={draft.latitude != null && draft.longitude != null
          ? { latitude: draft.latitude, longitude: draft.longitude }
          : null}
        radiusKm={travelForm.enabled ? Number(travelForm.maxKm) || null : null}
        onChange={(next) => setDraft((d) => ({ ...d, latitude: next.latitude, longitude: next.longitude }))}
        onNeighbourhoodDetected={(n) => setDraft((d) => (d.neighbourhood ? d : { ...d, neighbourhood: n }))}
      />

      <Field label="Neighbourhood">
        <select
          value={draft.neighbourhood ?? ""}
          onChange={(e) => setDraft({ ...draft, neighbourhood: e.target.value })}
          className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
          style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}
        >
          <option value="">Select a neighbourhood</option>
          {SG_NEIGHBOURHOODS.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </Field>

      {/* Default off, and stated plainly — a home studio must never become
          public by accident. */}
      <Checkbox
        checked={draft.addressIsPublic}
        onChange={(v) => setDraft({ ...draft, addressIsPublic: v })}
        label="Show my exact address publicly (leave off if you coach from home)"
      />

      <div className="mt-2 border-t pt-5" style={{ borderColor: T.outlineVariant }}>
        <Checkbox
          checked={travelForm.enabled}
          onChange={(v) => setTravelForm({ ...travelForm, enabled: v })}
          label="I travel to clients"
        />
        {travelForm.enabled && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Max distance (km)">
                <Input value={travelForm.maxKm} onChange={(v) => setTravelForm({ ...travelForm, maxKm: v.replace(/[^\d.]/g, "") })} inputMode="decimal" />
              </Field>
              <Field label="Travel buffer (min)" hint="Extra time on top of the journey">
                <Input value={travelForm.buffer} onChange={(v) => setTravelForm({ ...travelForm, buffer: v.replace(/\D/g, "") })} inputMode="numeric" />
              </Field>
            </div>
            <Field label="Areas you'll travel to">
              <div className="flex flex-wrap gap-2">
                {SG_NEIGHBOURHOODS.map((n) => {
                  const on = travelForm.areas.includes(n);
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setTravelForm({
                          ...travelForm,
                          areas: on ? travelForm.areas.filter((a) => a !== n) : [...travelForm.areas, n],
                        })
                      }
                      className="rounded-full border px-3 py-1.5 text-xs font-medium"
                      style={
                        on
                          ? { backgroundColor: T.primary, color: T.onPrimary, borderColor: T.primary }
                          : { borderColor: T.outlineVariant, color: T.onSurfaceVariant }
                      }
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      {error && <ErrorNote>{error}</ErrorNote>}
      <SaveRow
        pending={pending}
        saved={saved}
        onSave={() =>
          save(async () => {
            const locRes = await upsertCoachLocation({
              id: draft.id || undefined,
              label: draft.label,
              locationType: "COACH_LOCATION",
              neighbourhood: draft.neighbourhood ?? undefined,
              addressIsPublic: draft.addressIsPublic,
              latitude: draft.latitude ?? undefined,
              longitude: draft.longitude ?? undefined,
              addressLine: draft.addressLine ?? undefined,
              postalCode: draft.postalCode ?? undefined,
              // The first location a coach saves becomes the main one;
              // after that, "Make main" is an explicit choice.
              isPrimary: draft.isPrimary || locations.length === 0,
            });
            if (!locRes.ok) return locRes;
            return updateTravelRules({
              travelEnabled: travelForm.enabled,
              maxTravelKm: Number(travelForm.maxKm || 0),
              travelBufferMinutes: Number(travelForm.buffer || 0),
              serviceAreas: travelForm.areas,
            });
          })
        }
      />
    </Section>
  );
}

function AvailabilitySection({ rules }: { rules: SettingsData["availability"] }) {
  // A day holds a LIST of windows, not one. Coaches keep split days —
  // mornings before a day job, evenings after — and the availability
  // engine has always unioned multiple windows per weekday. Only this form
  // couldn't express it: it keyed rules by weekday into a Map, so a second
  // window was invisible here and deleted on the next save.
  const [days, setDays] = useState(() =>
    DAYS.map((_, weekday) => ({
      weekday,
      windows: rules
        .filter((r) => r.weekday === weekday)
        .sort((a, b) => a.startMinute - b.startMinute)
        .map((r) => ({ start: minutesToTime(r.startMinute), end: minutesToTime(r.endMinute) })),
    }))
  );
  const { pending, error, saved, save } = useSaver();

  const update = (weekday: number, fn: (w: Array<{ start: string; end: string }>) => Array<{ start: string; end: string }>) =>
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, windows: fn(d.windows) } : d)));

  return (
    <Section
      title="Weekly availability"
      description="The hours clients can book. Add more than one block to a day if you coach mornings and evenings. You can block one-off dates later."
    >
      <div className="flex flex-col gap-3">
        {days.map((d) => {
          const open = d.windows.length > 0;
          return (
            <div
              key={d.weekday}
              className="rounded-xl border p-3"
              style={{ borderColor: T.outlineVariant, backgroundColor: open ? T.surfaceContainerLowest : "transparent" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2.5 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={open}
                    onChange={(e) =>
                      update(d.weekday, () =>
                        e.target.checked ? [{ start: "09:00", end: "17:00" }] : []
                      )
                    }
                    className="h-4 w-4 rounded"
                    style={{ accentColor: T.primary }}
                  />
                  {DAYS[d.weekday]}
                </label>
                {!open && (
                  <span className="text-sm" style={{ color: T.onSurfaceVariant }}>Closed</span>
                )}
              </div>

              {open && (
                <div className="mt-3 flex flex-col gap-2">
                  {d.windows.map((w, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        value={w.start}
                        aria-label={`${DAYS[d.weekday]} block ${i + 1} start`}
                        onChange={(e) =>
                          update(d.weekday, (ws) => ws.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))
                        }
                        className="rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}
                      />
                      <span className="text-sm" style={{ color: T.onSurfaceVariant }}>to</span>
                      <input
                        type="time"
                        value={w.end}
                        aria-label={`${DAYS[d.weekday]} block ${i + 1} end`}
                        onChange={(e) =>
                          update(d.weekday, (ws) => ws.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))
                        }
                        className="rounded-lg border px-3 py-2 text-sm"
                        style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}
                      />
                      {d.windows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => update(d.weekday, (ws) => ws.filter((_, j) => j !== i))}
                          aria-label={`Remove ${DAYS[d.weekday]} block ${i + 1}`}
                          className="rounded-full px-2.5 py-1 text-sm"
                          style={{ color: T.error }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      update(d.weekday, (ws) => [
                        ...ws,
                        // Default the new block after the last one, so the
                        // common case (a gap, then evenings) needs no edit.
                        { start: ws[ws.length - 1]?.end ?? "18:00", end: "21:00" },
                      ])
                    }
                    className="self-start rounded-full border px-3.5 py-1.5 text-[13px] font-medium"
                    style={{ borderColor: T.outlineVariant, color: T.onSurfaceVariant }}
                  >
                    + Add another block
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      <SaveRow
        pending={pending}
        saved={saved}
        onSave={() =>
          save(() =>
            setAvailabilityRules(
              days.flatMap((d) =>
                d.windows.map((w) => ({
                  weekday: d.weekday,
                  startMinute: timeToMinutes(w.start),
                  endMinute: timeToMinutes(w.end),
                }))
              )
            )
          )
        }
      />
    </Section>
  );
}

function useSaver() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      setSaved(false);
      const res = await fn();
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      } else {
        setError(res.error ?? "Couldn't save. Please try again.");
      }
    });

  return { pending, error, saved, save };
}

function Section({
  title,
  description,
  accent,
  children,
}: {
  title: string;
  description?: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl border p-5 md:p-6"
      style={{
        backgroundColor: accent ? T.warningContainer : T.surfaceContainerLowest,
        borderColor: T.outlineVariant,
      }}
    >
      <h2 className="text-lg font-semibold tracking-[-0.01em]">{title}</h2>
      {description && (
        <p className="mt-1 text-sm" style={{ color: T.onSurfaceVariant }}>{description}</p>
      )}
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  // The hint sits BELOW the input, not between label and input. Placed
  // above, it pushed the input down by its own height, so two fields
  // side by side in a grid only lined up when both had hints or neither
  // did — "Address" against "Postal code", "Max distance" against
  // "Travel buffer". Below, every input in a row starts at the same y.
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs" style={{ color: T.onSurfaceVariant }}>{hint}</span>}
    </label>
  );
}

function Input({
  value,
  onChange,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  inputMode?: "numeric" | "decimal";
}) {
  return (
    <input
      value={value}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border px-4 py-3 text-sm outline-none"
      style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}
    />
  );
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border px-3 py-2 text-sm outline-none"
      style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}
    />
  );
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded"
        style={{ accentColor: T.primary }}
      />
      {label}
    </label>
  );
}

function Button({
  children,
  onClick,
  pending,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  pending?: boolean;
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium transition-colors disabled:opacity-60"
      style={
        variant === "primary"
          ? { backgroundColor: T.primary, color: T.onPrimary }
          : { border: `1px solid ${T.outlineVariant}`, color: T.onSurface }
      }
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function SaveRow({ pending, saved, onSave }: { pending: boolean; saved: boolean; onSave: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <Button pending={pending} onClick={onSave}>Save</Button>
      {saved && (
        <span className="text-sm" style={{ color: T.success }} role="status">Saved</span>
      )}
    </div>
  );
}

function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="rounded-xl border px-4 py-3 text-sm"
      style={{ backgroundColor: T.errorContainer, borderColor: "transparent", color: T.error }}
      role="alert"
    >
      {children}
    </p>
  );
}


/** Booking rules and cancellation policy.
 *
 * These were already governing every search and every refund with no way
 * for a coach to set them, so the product was making promises on their
 * behalf — a profile advertising "free cancellation up to 24 hours before"
 * stated a default nobody had agreed to.
 *
 * The policy is shown back as a sentence, because the consequence of two
 * numbers is not obvious from the numbers.
 */
function BookingPreferencesSection({
  preferences,
}: {
  preferences: SettingsData["bookingPreferences"];
}) {
  const [form, setForm] = useState({
    bufferBeforeMinutes: String(preferences.bufferBeforeMinutes),
    bufferAfterMinutes: String(preferences.bufferAfterMinutes),
    minNoticeHours: String(preferences.minNoticeHours),
    maxAdvanceDays: String(preferences.maxAdvanceDays),
    cancellationFullRefundHours: String(preferences.cancellationFullRefundHours),
    cancellationPartialRefundPercent: String(preferences.cancellationPartialRefundPercent),
  });
  const { pending, error, saved, save } = useSaver();

  const digits = (v: string) => v.replace(/\D/g, "");
  const num = (v: string) => Number(v || 0);

  return (
    <Section
      title="Booking preferences"
      description="How far ahead clients can book, the gaps you need, and what happens when someone cancels."
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="Buffer before (min)" hint="Time to set up">
          <Input
            value={form.bufferBeforeMinutes}
            onChange={(v) => setForm({ ...form, bufferBeforeMinutes: digits(v) })}
            inputMode="numeric"
          />
        </Field>
        <Field label="Buffer after (min)" hint="Time to pack down or travel">
          <Input
            value={form.bufferAfterMinutes}
            onChange={(v) => setForm({ ...form, bufferAfterMinutes: digits(v) })}
            inputMode="numeric"
          />
        </Field>
        <Field label="Minimum notice (hours)" hint="How late someone can book">
          <Input
            value={form.minNoticeHours}
            onChange={(v) => setForm({ ...form, minNoticeHours: digits(v) })}
            inputMode="numeric"
          />
        </Field>
        <Field label="Booking window (days)" hint="How far ahead your calendar opens">
          <Input
            value={form.maxAdvanceDays}
            onChange={(v) => setForm({ ...form, maxAdvanceDays: digits(v) })}
            inputMode="numeric"
          />
        </Field>
      </div>

      <div className="mt-2 border-t pt-5" style={{ borderColor: T.outlineVariant }}>
        <p className="mb-3 text-sm font-medium">If a client cancels</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Free cancellation up to (hours)">
            <Input
              value={form.cancellationFullRefundHours}
              onChange={(v) => setForm({ ...form, cancellationFullRefundHours: digits(v) })}
              inputMode="numeric"
            />
          </Field>
          <Field label="Refund after that (%)">
            <Input
              value={form.cancellationPartialRefundPercent}
              onChange={(v) => setForm({ ...form, cancellationPartialRefundPercent: digits(v) })}
              inputMode="numeric"
            />
          </Field>
        </div>

        <p className="mt-3 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: T.surfaceContainerLow }}>
          {describeCancellationPolicy(
            num(form.cancellationFullRefundHours),
            num(form.cancellationPartialRefundPercent)
          )}
        </p>
        <p className="mt-2 text-xs" style={{ color: T.onSurfaceVariant }}>
          Applies to new bookings. Sessions already booked keep the terms they were sold under.
        </p>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      <SaveRow
        pending={pending}
        saved={saved}
        onSave={() =>
          save(async () =>
            updateBookingPreferences({
              bufferBeforeMinutes: num(form.bufferBeforeMinutes),
              bufferAfterMinutes: num(form.bufferAfterMinutes),
              minNoticeHours: num(form.minNoticeHours),
              maxAdvanceDays: num(form.maxAdvanceDays),
              cancellationFullRefundHours: num(form.cancellationFullRefundHours),
              cancellationPartialRefundPercent: num(form.cancellationPartialRefundPercent),
            })
          )
        }
      />
    </Section>
  );
}


/** Languages a coach can actually coach in.
 *
 * The public profile has always shown a Languages line, but nothing could
 * set it — the action defaulted every coach to English, so a Mandarin- or
 * Malay-speaking coach in Singapore was advertised as English-only. A
 * public claim nobody can correct is worse than no claim.
 */
const COMMON_LANGUAGES = ["English", "Mandarin", "Malay", "Tamil", "Cantonese", "Hindi", "Japanese", "Korean"];

function LanguagesField({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <Field label="Languages you coach in">
      <div className="flex flex-wrap gap-2">
        {COMMON_LANGUAGES.map((lang) => {
          const on = selected.includes(lang);
          return (
            <button
              key={lang}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((l) => l !== lang) : [...selected, lang])}
              className="rounded-full border px-3 py-1.5 text-xs font-medium"
              style={
                on
                  ? { backgroundColor: T.primary, color: T.onPrimary, borderColor: T.primary }
                  : { borderColor: T.outlineVariant, color: T.onSurfaceVariant }
              }
            >
              {lang}
            </button>
          );
        })}
      </div>
    </Field>
  );
}

/** One-off closures: a holiday, a competition, a Tuesday off.
 *
 * The weekly grid answers "when do you normally work"; this answers "when
 * are you away". Without it a coach going on holiday has to switch off
 * whole weekdays and remember to switch them back — and every client sees
 * a permanently narrower coach in the meantime.
 */
function TimeOffSection({ entries }: { entries: SettingsData["timeOff"] }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [reason, setReason] = useState("");
  const { pending, error, saved, save } = useSaver();
  const [removing, startRemoving] = useTransition();

  const dayFmt = new Intl.DateTimeFormat("en-SG", {
    timeZone: CLUB_MARKET.timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Section
      title="Time off"
      description="Block a holiday or a one-off day. Your weekly hours stay as they are."
    >
      {entries.length > 0 && (
        <ul className="mb-4 flex flex-col gap-2">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-2.5"
              style={{ borderColor: T.outlineVariant }}
            >
              <span className="text-sm">
                <span className="font-medium">
                  {dayFmt.format(new Date(e.startsAt))} – {dayFmt.format(new Date(e.endsAt))}
                </span>
                {e.reason && (
                  <span style={{ color: T.onSurfaceVariant }}> · {e.reason}</span>
                )}
              </span>
              <button
                type="button"
                disabled={removing}
                onClick={() => startRemoving(async () => { await removeAvailabilityException(e.id); })}
                className="text-sm underline underline-offset-2"
                style={{ color: T.error }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.4fr]">
        <Field label="From">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full rounded-xl border px-4 py-3 text-sm"
            style={{ borderColor: T.outlineVariant, backgroundColor: T.surfaceContainerLowest }}
          />
        </Field>
        <Field label="Reason (optional)" hint="Only you see this">
          <Input value={reason} onChange={setReason} />
        </Field>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}
      <SaveRow
        pending={pending}
        saved={saved}
        onSave={() =>
          save(async () => {
            if (!from || !to) return { ok: false as const, error: "Pick both dates." };
            // Whole days, in the market's timezone: a coach picking 5–7
            // means all three days off, not 00:00 to 00:00.
            const startsAt = new Date(`${from}T00:00:00+08:00`).toISOString();
            const endsAt = new Date(`${to}T23:59:59+08:00`).toISOString();
            if (new Date(endsAt) <= new Date(startsAt)) {
              return { ok: false as const, error: "The end date is before the start date." };
            }
            const result = await addAvailabilityException({ startsAt, endsAt, type: "blocked", reason });
            if (result.ok) {
              setFrom("");
              setTo("");
              setReason("");
            }
            return result;
          })
        }
      />
    </Section>
  );
}
