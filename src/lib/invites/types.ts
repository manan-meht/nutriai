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
  link: string;
  status: InviteStatus;
  expiresAt: string;
  claimedByWhatsappNumberMasked: string | null;
  claimedAt: string | null;
}
