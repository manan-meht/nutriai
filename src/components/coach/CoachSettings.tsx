"use client";

import { useState, useTransition } from "react";
import { CLUB_TOKENS as T } from "./tokens";
import { CoachPhotoSection } from "./CoachPhotoSection";
import { CoachLocationMap } from "./CoachLocationMap";
import { AddressSearch } from "./AddressSearch";
import { BOUNDS, describeCancellationPolicy } from "@/lib/club/booking-preferences";
import { PayoutsSection, type PayoutState } from "./PayoutsSection";
import { formatMoney, SG_NEIGHBOURHOODS } from "@/lib/club/config";
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
    status: string;
    photoUrl: string | null;
  };
  /** Signed URLs — the bucket is private, so these expire. */
  gallery: Array<{ id: string; url: string }>;
  payouts: PayoutState;
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
  location: {
    id: string;
    label: string;
    neighbourhood: string | null;
    addressIsPublic: boolean;
    latitude: number | null;
    longitude: number | null;
    addressLine: string | null;
    postalCode: string | null;
  } | null;
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
      <LocationSection location={data.location} travel={data.travel} />
      <AvailabilitySection rules={data.availability} />
      <BookingPreferencesSection preferences={data.bookingPreferences} />
      <PayoutsSection state={data.payouts} />
    </div>
  );
}

// ---- Sections --------------------------------------------------------

function PublishSection({ status, blockers }: { status: string; blockers: string[] }) {
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
            }
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

function LocationSection({
  location,
  travel,
}: {
  location: SettingsData["location"];
  travel: SettingsData["travel"];
}) {
  const [form, setForm] = useState({
    label: location?.label ?? "",
    neighbourhood: location?.neighbourhood ?? "",
    addressIsPublic: location?.addressIsPublic ?? false,
    latitude: location?.latitude ?? null as number | null,
    longitude: location?.longitude ?? null as number | null,
    addressLine: location?.addressLine ?? "",
    postalCode: location?.postalCode ?? "",
  });
  const [travelForm, setTravelForm] = useState({
    enabled: travel?.travelEnabled ?? false,
    maxKm: travel?.maxTravelKm?.toString() ?? "10",
    buffer: travel?.travelBufferMinutes?.toString() ?? "15",
    areas: travel?.serviceAreas ?? [],
  });
  const { pending, error, saved, save } = useSaver();

  return (
    <Section title="Where you coach" description="Clients see your neighbourhood, never your exact address.">
      <Field label="Location name" hint="e.g. River Valley studio">
        <Input value={form.label} onChange={(v) => setForm({ ...form, label: v })} />
      </Field>

      <AddressSearch
        onSelect={(r) =>
          setForm((f) => ({
            ...f,
            latitude: r.latitude,
            longitude: r.longitude,
            addressLine: r.addressLine ?? f.addressLine,
            postalCode: r.postalCode ?? f.postalCode,
            // Only fills a blank — a coach who picked a neighbourhood
            // deliberately keeps it.
            neighbourhood: f.neighbourhood || r.neighbourhood || "",
          }))
        }
      />

      <div className="grid grid-cols-[1fr_9rem] gap-4">
        <Field label="Address" hint="Kept private unless you choose otherwise below">
          <Input value={form.addressLine} onChange={(v) => setForm({ ...form, addressLine: v })} />
        </Field>
        <Field label="Postal code">
          <Input value={form.postalCode} onChange={(v) => setForm({ ...form, postalCode: v })} inputMode="numeric" />
        </Field>
      </div>

      {/* Coordinates drive travel-aware availability: without them the
          engine cannot tell whether a coach can physically reach a client
          between sessions, and correctly refuses to guess. */}
      <CoachLocationMap
        value={form.latitude != null && form.longitude != null
          ? { latitude: form.latitude, longitude: form.longitude }
          : null}
        radiusKm={travelForm.enabled ? Number(travelForm.maxKm) || null : null}
        onChange={(next) => setForm((f) => ({ ...f, latitude: next.latitude, longitude: next.longitude }))}
        onNeighbourhoodDetected={(n) => setForm((f) => (f.neighbourhood ? f : { ...f, neighbourhood: n }))}
      />
      <Field label="Neighbourhood">
        <select
          value={form.neighbourhood}
          onChange={(e) => setForm({ ...form, neighbourhood: e.target.value })}
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
        checked={form.addressIsPublic}
        onChange={(v) => setForm({ ...form, addressIsPublic: v })}
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
      <SaveRow
        pending={pending}
        saved={saved}
        onSave={() =>
          save(async () => {
            const locRes = await upsertCoachLocation({
              id: location?.id,
              label: form.label,
              locationType: "COACH_LOCATION",
              neighbourhood: form.neighbourhood,
              addressIsPublic: form.addressIsPublic,
              // Sent as undefined rather than null when unpinned, so an
              // existing pin is never wiped by saving the rest of the form.
              latitude: form.latitude ?? undefined,
              longitude: form.longitude ?? undefined,
              addressLine: form.addressLine,
              postalCode: form.postalCode,
              isPrimary: true,
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
  const byDay = new Map(rules.map((r) => [r.weekday, r]));
  const [days, setDays] = useState(
    DAYS.map((_, weekday) => {
      const existing = byDay.get(weekday);
      return {
        weekday,
        enabled: !!existing,
        start: minutesToTime(existing?.startMinute ?? 9 * 60),
        end: minutesToTime(existing?.endMinute ?? 17 * 60),
      };
    })
  );
  const { pending, error, saved, save } = useSaver();

  return (
    <Section title="Weekly availability" description="The hours clients can book. You can block one-off dates later.">
      <div className="flex flex-col gap-2">
        {days.map((d, i) => (
          <div key={d.weekday} className="flex flex-wrap items-center gap-3">
            <label className="flex min-w-[130px] items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={d.enabled}
                onChange={(e) => {
                  const next = [...days];
                  next[i] = { ...d, enabled: e.target.checked };
                  setDays(next);
                }}
                className="h-4 w-4 rounded"
                style={{ accentColor: T.primary }}
              />
              {DAYS[d.weekday]}
            </label>
            {d.enabled && (
              <div className="flex items-center gap-2">
                <TimeInput
                  value={d.start}
                  onChange={(v) => {
                    const next = [...days];
                    next[i] = { ...d, start: v };
                    setDays(next);
                  }}
                />
                <span className="text-sm" style={{ color: T.onSurfaceVariant }}>to</span>
                <TimeInput
                  value={d.end}
                  onChange={(v) => {
                    const next = [...days];
                    next[i] = { ...d, end: v };
                    setDays(next);
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      <SaveRow
        pending={pending}
        saved={saved}
        onSave={() =>
          save(() =>
            setAvailabilityRules(
              days
                .filter((d) => d.enabled)
                .map((d) => ({
                  weekday: d.weekday,
                  startMinute: timeToMinutes(d.start),
                  endMinute: timeToMinutes(d.end),
                }))
            )
          )
        }
      />
    </Section>
  );
}

// ---- Shared pieces ---------------------------------------------------

/** Per-section save state. Each section owns its own, so one failing save
 * never wipes another section's unsaved edits. */
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
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {hint && <span className="mb-1.5 block text-xs" style={{ color: T.onSurfaceVariant }}>{hint}</span>}
      {children}
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
