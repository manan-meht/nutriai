export type InviteType = "family" | "self" | "coach_client";
export type InviteStatus = "pending" | "claimed" | "expired" | "revoked";

export interface WhatsappInvite {
  id: string;
  token: string;
  inviteType: InviteType;
  createdByUserId: string;
  workspaceId: string;
  targetProfileId: string | null;
  intendedPhone: string | null;
  status: InviteStatus;
  claimedByWhatsappNumber: string | null;
  claimedAt: string | null;
  expiresAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const INVITE_COMMAND_LABEL: Record<InviteType, string> = {
  family: "FAMILY",
  self: "SELF",
  coach_client: "COACHCLIENT",
};

/** What the UI actually needs to render an invite card — never exposes
 * internal IDs (target_profile_id, created_by_user_id) or the raw claimed
 * WhatsApp number. */
export interface InviteSummary {
  token: string;
  /** The bot link (wa.me/<bot>?text=JOIN...) — only the invitee should ever
   * open this themselves (used directly for the self-tracking flow). */
  link: string;
  /** wa.me/?text=... (no recipient) — what the inviter (caregiver/coach)
   * should click to share the invite via their own WhatsApp. Undefined for
   * "self" invites, which have no separate inviter/invitee to share between. */
  shareLink?: string;
  /** Plain-text version of what shareLink pre-fills — what "Copy invite
   * link" should put on the clipboard so a pasted message explains what
   * Tistra Health is, not just a bare wa.me URL. Undefined for "self"
   * invites (no separate inviter/invitee to share between). */
  shareMessage?: string;
  status: InviteStatus;
  expiresAt: string;
  claimedByWhatsappNumberMasked: string | null;
  claimedAt: string | null;
}
