import type { SupabaseClient } from "@supabase/supabase-js";

// Minimal, self-contained reimplementation of the main web app's
// src/lib/invites/{service,messages,token}.ts — kept as its own small
// module here (rather than importing across app boundaries, which isn't
// possible: this is a separate Cloudflare Pages project with its own
// dependency/bundle-size budget, see this app's README) rather than a
// shared package, since only the "get-or-create a family invite" path is
// needed on mobile for now (see apps/mobile/src/app/(app)/adults/add.tsx).
// Keep this in sync with the main app's version if the invite schema or
// message copy changes.

export type InviteType = "family" | "self" | "coach_client";
export type InviteStatus = "pending" | "claimed" | "expired" | "revoked";

const INVITE_COMMAND_LABEL: Record<InviteType, string> = {
  family: "FAMILY",
  self: "SELF",
  coach_client: "COACHCLIENT",
};

export interface InviteSummary {
  token: string;
  link: string;
  shareLink?: string;
  shareMessage?: string;
  status: InviteStatus;
  expiresAt: string;
  claimedByWhatsappNumberMasked: string | null;
  claimedAt: string | null;
  linkOpenedAt: string | null;
}

interface WhatsappInviteRow {
  id: string;
  token: string;
  invite_type: InviteType;
  created_by_user_id: string;
  workspace_id: string;
  target_profile_id: string | null;
  status: InviteStatus;
  claimed_by_whatsapp_number: string | null;
  claimed_at: string | null;
  expires_at: string;
  link_opened_at: string | null;
}

const TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TOKEN_LENGTH = 6;
const DEFAULT_EXPIRY_DAYS = 14;

function generateInviteToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let token = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) token += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  return token;
}

function buildJoinCommandText(type: InviteType, token: string): string {
  return `JOIN ${INVITE_COMMAND_LABEL[type]} ${token}`;
}

function buildWhatsAppInviteLink(type: InviteType, token: string): string {
  const number = process.env.TISTRA_WHATSAPP_NUMBER;
  if (!number) throw new Error("TISTRA_WHATSAPP_NUMBER is not configured");
  const text = encodeURIComponent(buildJoinCommandText(type, token));
  return `https://wa.me/${number}?text=${text}`;
}

function buildShareMessage(type: Exclude<InviteType, "self">, link: string, recipientName?: string): string {
  const greeting = recipientName ? `Hi ${recipientName}` : "Hi";
  if (type === "family") {
    return `${greeting}, I'm using Tistra Health to help track food and health updates more easily. Please tap this link and send the prefilled message to start with Tistra:\n\n${link}`;
  }
  return `${greeting}, I'm using Tistra Health to help with nutrition tracking and coaching. Please tap this link and send the prefilled message to start sharing your meal updates with me on WhatsApp:\n\n${link}`;
}

function buildShareLink(type: Exclude<InviteType, "self">, inviteLink: string, recipientName?: string): string {
  const text = encodeURIComponent(buildShareMessage(type, inviteLink, recipientName));
  return `https://wa.me/?text=${text}`;
}

function maskWhatsAppNumber(number: string | null): string | null {
  if (!number) return null;
  const digits = number.replace(/\D/g, "");
  if (digits.length <= 4) return "•".repeat(digits.length);
  return `${"•".repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function expiryDays(): number {
  const raw = process.env.INVITE_EXPIRY_DAYS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_EXPIRY_DAYS;
}

async function findLatestInvite(
  db: SupabaseClient,
  workspaceId: string,
  inviteType: InviteType,
  targetProfileId: string
): Promise<WhatsappInviteRow | null> {
  const { data } = await db
    .from("whatsapp_invites")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("invite_type", inviteType)
    .eq("target_profile_id", targetProfileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as WhatsappInviteRow | null;
}

/** Retries once on the astronomically unlikely token-collision unique
 * constraint violation, same as the main app's createInvite. */
async function createInvite(
  db: SupabaseClient,
  workspaceId: string,
  inviteType: InviteType,
  createdByUserId: string,
  targetProfileId: string
): Promise<WhatsappInviteRow> {
  const expiresAt = new Date(Date.now() + expiryDays() * 24 * 60 * 60 * 1000).toISOString();

  for (let attempt = 0; attempt < 2; attempt++) {
    const token = generateInviteToken();
    const { data, error } = await db
      .from("whatsapp_invites")
      .insert({
        token,
        invite_type: inviteType,
        created_by_user_id: createdByUserId,
        workspace_id: workspaceId,
        target_profile_id: targetProfileId,
        status: "pending",
        expires_at: expiresAt,
        metadata: {},
      })
      .select("*")
      .single();

    if (!error && data) return data as WhatsappInviteRow;
    if (error && !error.message?.toLowerCase().includes("duplicate")) {
      throw new Error(`Failed to create invite: ${error.message}`);
    }
  }
  throw new Error("Failed to create invite: token collision retry exhausted");
}

function toInviteSummary(invite: WhatsappInviteRow, recipientName?: string): InviteSummary {
  const link = buildWhatsAppInviteLink(invite.invite_type, invite.token);
  return {
    token: invite.token,
    link,
    shareLink: invite.invite_type === "self" ? undefined : buildShareLink(invite.invite_type, link, recipientName),
    shareMessage: invite.invite_type === "self" ? undefined : buildShareMessage(invite.invite_type, link, recipientName),
    status: invite.status,
    expiresAt: invite.expires_at,
    claimedByWhatsappNumberMasked: maskWhatsAppNumber(invite.claimed_by_whatsapp_number),
    claimedAt: invite.claimed_at,
    linkOpenedAt: invite.link_opened_at,
  };
}

/** Returns the family member's existing pending/claimed invite, or creates
 * a fresh one if none exists (or the last one expired/was revoked) —
 * mirrors the main web app's getOrCreateFamilyInvite
 * (src/app/(adults)/adults/dashboard/actions.ts). */
export async function getOrCreateFamilyInvite(
  db: SupabaseClient,
  workspaceId: string,
  contactId: string,
  createdByUserId: string,
  recipientName?: string
): Promise<InviteSummary> {
  const existing = await findLatestInvite(db, workspaceId, "family", contactId);
  const invite =
    existing && (existing.status === "pending" || existing.status === "claimed")
      ? existing
      : await createInvite(db, workspaceId, "family", createdByUserId, contactId);
  return toInviteSummary(invite, recipientName);
}
