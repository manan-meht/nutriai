import { INVITE_COMMAND_LABEL, type InviteType } from "./types";

/** The exact text the invitee sends to the bot, e.g. "JOIN FAMILY 8F42K3". */
export function buildJoinCommandText(type: InviteType, token: string): string {
  return `JOIN ${INVITE_COMMAND_LABEL[type]} ${token}`;
}

/** Builds the wa.me deep link that opens WhatsApp with the join command
 * prefilled. The bot's number is read server-side (TISTRA_WHATSAPP_NUMBER)
 * so it's never hardcoded and never needs to live in client bundle code —
 * callers only ever receive this fully-built URL. */
export function buildWhatsAppInviteLink(type: InviteType, token: string): string {
  const number = process.env.TISTRA_WHATSAPP_NUMBER;
  if (!number) {
    throw new Error("TISTRA_WHATSAPP_NUMBER is not configured — see .env.example");
  }
  const text = encodeURIComponent(buildJoinCommandText(type, token));
  return `https://wa.me/${number}?text=${text}`;
}

/** The message the inviting user (caregiver/coach) shares with the invitee
 * — via their own WhatsApp share sheet, not sent by the bot. */
export function buildShareMessage(type: Exclude<InviteType, "self">, link: string): string {
  if (type === "family") {
    return `Hi, I'm using Tistra Health to help track food and health updates more easily. Please tap this link and send the prefilled message to start with Tistra:\n\n${link}`;
  }
  return `Hi, I'm using Tistra Health to help with nutrition tracking and coaching. Please tap this link and send the prefilled message to start sharing your meal updates with me on WhatsApp:\n\n${link}`;
}

/** wa.me with no recipient number opens WhatsApp's contact picker with this
 * text prefilled — this is what the inviting user (caregiver/coach) should
 * click, NOT buildWhatsAppInviteLink's bot link (that one is only for the
 * invitee themselves to send). Using the bot link here would have the
 * inviter open their own chat with the bot and, if sent, incorrectly link
 * their own number instead of the invitee's. */
export function buildShareLink(type: Exclude<InviteType, "self">, inviteLink: string): string {
  const text = encodeURIComponent(buildShareMessage(type, inviteLink));
  return `https://wa.me/?text=${text}`;
}

export function buildWelcomeMessage(type: InviteType): string {
  switch (type) {
    case "family":
      return "Welcome to Tistra Health. You're now connected. You can send a photo of your meal here whenever you eat, and I'll help track it.";
    case "self":
      return "Welcome to Tistra Health. You're set up for self tracking. Send a photo of your meal whenever you eat, and I'll help you understand your nutrition.";
    case "coach_client":
      return "Welcome to Tistra Health. You're now connected with your coach. Send meal photos here, and Tistra will help organize your updates for your coach.";
  }
}

export const INVITE_ERROR_MESSAGES = {
  invalid: "This invite link looks invalid or expired. Please ask the person who invited you to send a new Tistra Health invite.",
  claimed: "This Tistra Health invite has already been used. Please ask for a new invite if you need to connect another number.",
  expired: "This Tistra Health invite has expired. Please ask for a new invite.",
} as const;
