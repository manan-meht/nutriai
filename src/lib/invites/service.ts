import { generateInviteToken } from "./token";
import { buildWhatsAppInviteLink } from "./messages";
import type { InviteSummary, InviteType, WhatsappInvite } from "./types";

const DEFAULT_EXPIRY_DAYS = 14;

function expiryDays(): number {
  const raw = process.env.INVITE_EXPIRY_DAYS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRY_DAYS;
}

function mapInviteRow(row: any): WhatsappInvite {
  return {
    id: row.id,
    token: row.token,
    inviteType: row.invite_type,
    createdByUserId: row.created_by_user_id,
    workspaceId: row.workspace_id,
    targetProfileId: row.target_profile_id,
    intendedPhone: row.intended_phone,
    status: row.status,
    claimedByWhatsappNumber: row.claimed_by_whatsapp_number,
    claimedAt: row.claimed_at,
    expiresAt: row.expires_at,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateInviteInput {
  inviteType: InviteType;
  createdByUserId: string;
  workspaceId: string;
  targetProfileId?: string | null;
  intendedPhone?: string | null;
  metadata?: Record<string, unknown>;
}

/** Creates a single-use, time-limited invite. Retries once on the
 * astronomically unlikely token collision (unique constraint violation)
 * rather than trusting uniqueness purely probabilistically. */
export async function createInvite(db: any, input: CreateInviteInput): Promise<WhatsappInvite> {
  const expiresAt = new Date(Date.now() + expiryDays() * 24 * 60 * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = generateInviteToken();
    const { data, error } = await db
      .from("whatsapp_invites")
      .insert({
        token,
        invite_type: input.inviteType,
        created_by_user_id: input.createdByUserId,
        workspace_id: input.workspaceId,
        target_profile_id: input.targetProfileId ?? null,
        intended_phone: input.intendedPhone ?? null,
        status: "pending",
        expires_at: expiresAt,
        metadata: input.metadata ?? {},
      })
      .select()
      .single();

    if (!error && data) return mapInviteRow(data);
    if (error && !error.message?.toLowerCase().includes("duplicate")) {
      throw new Error(`Failed to create invite: ${error.message}`);
    }
  }
  throw new Error("Failed to create invite: token collision retry exhausted");
}

export async function getInviteByToken(db: any, token: string): Promise<WhatsappInvite | null> {
  const { data } = await db.from("whatsapp_invites").select("*").eq("token", token.toUpperCase()).maybeSingle();
  return data ? mapInviteRow(data) : null;
}

export type InviteValidationResult = { ok: true } | { ok: false; reason: "invalid" | "claimed" | "expired" };

/** Pure validation — no DB writes. Treats a pending-but-past-expiry invite
 * as expired even if a background job hasn't flipped its status column
 * yet, so expiry is enforced consistently regardless of whether that
 * housekeeping job exists. */
export function validateInviteForClaim(invite: WhatsappInvite | null): InviteValidationResult {
  if (!invite) return { ok: false, reason: "invalid" };
  if (invite.status === "revoked") return { ok: false, reason: "invalid" };
  if (invite.status === "claimed") return { ok: false, reason: "claimed" };
  if (invite.status === "expired" || new Date(invite.expiresAt).getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

/** Marks an invite claimed and (optionally) links it to a profile created
 * at claim time (the 'self' flow doesn't have a target_profile_id until
 * now). Domain-specific linking (updating/creating the actual
 * adults_contacts/gym_clients row) is the caller's responsibility — this
 * function only owns the invite row itself. */
export async function markInviteClaimed(
  db: any,
  inviteId: string,
  params: { claimedByWhatsappNumber: string; targetProfileId?: string }
): Promise<void> {
  const { error } = await db
    .from("whatsapp_invites")
    .update({
      status: "claimed",
      claimed_by_whatsapp_number: params.claimedByWhatsappNumber,
      claimed_at: new Date().toISOString(),
      ...(params.targetProfileId ? { target_profile_id: params.targetProfileId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId);
  if (error) throw new Error(`Failed to mark invite claimed: ${error.message}`);
}

export async function revokeInvite(db: any, inviteId: string): Promise<void> {
  const { error } = await db
    .from("whatsapp_invites")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("status", "pending");
  if (error) throw new Error(`Failed to revoke invite: ${error.message}`);
}

/** Revokes the old invite (if still pending) and creates a fresh one with
 * the same type/target — used by the UI's "Regenerate" action. */
export async function regenerateInvite(db: any, oldInvite: WhatsappInvite): Promise<WhatsappInvite> {
  await revokeInvite(db, oldInvite.id);
  return createInvite(db, {
    inviteType: oldInvite.inviteType,
    createdByUserId: oldInvite.createdByUserId,
    workspaceId: oldInvite.workspaceId,
    targetProfileId: oldInvite.targetProfileId,
    intendedPhone: oldInvite.intendedPhone,
    metadata: oldInvite.metadata,
  });
}

export interface FindInviteInput {
  workspaceId: string;
  inviteType: InviteType;
  /** For family/coach_client: the existing contact/client id. */
  targetProfileId?: string;
  /** For self: invites start with no target_profile_id, so they're found
   * by creator instead. */
  createdByUserId?: string;
}

/** Finds the most recent invite for a given target (any status) — used to
 * decide whether the UI should show an existing invite or create a fresh
 * one. Family/coach_client invites are looked up by target_profile_id;
 * self invites (which have no target until claimed) are looked up by
 * created_by_user_id instead. */
export async function findLatestInvite(db: any, input: FindInviteInput): Promise<WhatsappInvite | null> {
  let query = db
    .from("whatsapp_invites")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .eq("invite_type", input.inviteType)
    .order("created_at", { ascending: false })
    .limit(1);

  query = input.targetProfileId ? query.eq("target_profile_id", input.targetProfileId) : query.eq("created_by_user_id", input.createdByUserId);

  const { data } = await query.maybeSingle();
  return data ? mapInviteRow(data) : null;
}

/** Returns the existing pending/claimed invite for a target if one exists,
 * otherwise creates a fresh one — the shared "get or create" used by every
 * product's invite-card UI so opening the card doesn't spawn a new token
 * every time. Expired/revoked invites are replaced automatically. */
export async function getOrCreateInvite(db: any, findInput: FindInviteInput, createInput: CreateInviteInput): Promise<WhatsappInvite> {
  const existing = await findLatestInvite(db, findInput);
  if (existing && (existing.status === "pending" || existing.status === "claimed")) {
    return existing;
  }
  return createInvite(db, createInput);
}

export function toInviteSummary(invite: WhatsappInvite): InviteSummary {
  return {
    token: invite.token,
    link: buildWhatsAppInviteLink(invite.inviteType, invite.token),
    status: invite.status,
    expiresAt: invite.expiresAt,
    claimedByWhatsappNumberMasked: maskWhatsAppNumber(invite.claimedByWhatsappNumber),
    claimedAt: invite.claimedAt,
  };
}

export function maskWhatsAppNumber(number: string | null): string | null {
  if (!number) return null;
  const digits = number.replace(/\D/g, "");
  if (digits.length <= 4) return "•".repeat(digits.length);
  return `${"•".repeat(digits.length - 4)}${digits.slice(-4)}`;
}
