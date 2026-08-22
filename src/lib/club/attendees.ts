import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * People a client books for — their child, parent, partner.
 *
 * An attendee is deliberately not an auth user. They never pay, cancel or
 * receive anything; the person who booked stays the payer and owns the
 * refund. That keeps a child off the login surface entirely, which is the
 * right default when most attendees here are minors.
 *
 * The booking carries a NAME snapshot alongside the id, for the same reason
 * it snapshots price and cancellation terms: who attended is a fact about
 * that session, and must survive the attendee later being renamed or
 * removed.
 */

export interface Attendee {
  id: string;
  fullName: string;
  relationship: string | null;
  dateOfBirth: string | null;
  notes: string | null;
}

export interface AttendeeInput {
  fullName: string;
  relationship?: string | null;
  dateOfBirth?: string | null;
  notes?: string | null;
}

/** Suggestions, not a closed list — the column is free text on purpose.
 * "Grandson" and "training partner" are real answers we have no business
 * refusing. */
export const RELATIONSHIP_SUGGESTIONS = [
  "Child",
  "Parent",
  "Partner",
  "Sibling",
  "Friend",
  "Other",
] as const;

export function attendeeProblem(input: AttendeeInput): string | null {
  const name = input.fullName?.trim() ?? "";
  if (name.length === 0) return "Enter a name.";
  if (name.length > 80) return "That name is too long.";
  if (input.dateOfBirth) {
    const dob = new Date(input.dateOfBirth);
    if (Number.isNaN(dob.getTime())) return "That date of birth isn't valid.";
    if (dob.getTime() > Date.now()) return "That date of birth is in the future.";
  }
  return null;
}

/** Age in whole years, or null when no date of birth was given.
 *
 * Coaches ask because it changes how they run a session — a nine-year-old
 * and a sixty-year-old need different things from the same class. It is
 * optional for exactly that reason: useful, never required. */
export function ageFrom(dateOfBirth: string | null, now: Date = new Date()): number | null {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
  return age >= 0 ? age : null;
}

export async function listAttendees(
  admin: SupabaseClient,
  clientProfileId: string
): Promise<Attendee[]> {
  const { data, error } = await admin
    .from("club_attendees")
    .select("id, full_name, relationship, date_of_birth, notes")
    .eq("client_profile_id", clientProfileId)
    .is("deleted_at", null)
    .order("created_at");
  if (error) throw new Error(`club_attendees: ${error.message}`);
  return (data ?? []).map((row: any) => ({
    id: row.id,
    fullName: row.full_name,
    relationship: row.relationship,
    dateOfBirth: row.date_of_birth,
    notes: row.notes,
  }));
}

/** How the coach sees who is coming: the name, and the age when it was
 * offered. Never the booker's relationship to them — "son" is the client's
 * business, and the coach only needs to know who to expect. */
export function attendeeSummary(
  attendee: Pick<Attendee, "fullName" | "dateOfBirth">,
  now: Date = new Date()
): string {
  const age = ageFrom(attendee.dateOfBirth, now);
  return age == null ? attendee.fullName : `${attendee.fullName} (${age})`;
}
