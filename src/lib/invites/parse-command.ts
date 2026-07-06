import type { InviteType } from "./types";

export interface ParsedJoinCommand {
  type: InviteType;
  token: string;
}

// Accepts "JOIN FAMILY <token>" and the more forgiving "START FAMILY
// <token>" alias, case-insensitive, tolerant of extra whitespace/newlines
// and a leading command word split across lines (WhatsApp clients sometimes
// wrap prefilled text). The token itself is [A-Z0-9]{4,10} to comfortably
// cover generateInviteToken()'s 6-char output without being over-strict.
const COMMAND_PATTERN = /^(?:join|start)\s+(family|self|coach\s*client)\s+([A-Z0-9]{4,10})$/i;

const TYPE_ALIASES: Record<string, InviteType> = {
  family: "family",
  self: "self",
  coachclient: "coach_client",
};

/** Parses an inbound WhatsApp message text as an invite-claim command.
 * Returns null if it doesn't match — callers should fall through to normal
 * message handling in that case, not treat it as an error. */
export function parseJoinCommand(rawText: string): ParsedJoinCommand | null {
  const normalized = rawText.replace(/\s+/g, " ").trim();
  const match = COMMAND_PATTERN.exec(normalized);
  if (!match) return null;

  const typeKey = match[1].toLowerCase().replace(/\s+/g, "");
  const type = TYPE_ALIASES[typeKey];
  if (!type) return null;

  return { type, token: match[2].toUpperCase() };
}
