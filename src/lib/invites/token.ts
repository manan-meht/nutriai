// Excludes visually-ambiguous characters (0/O, 1/I/L) since the invitee has
// to type this by hand as part of "JOIN FAMILY <TOKEN>" on WhatsApp.
const TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TOKEN_LENGTH = 6;

/** Generates a short, hard-to-guess, human-typeable invite token.
 * 32^6 ≈ 1.07 billion possibilities — plenty for single-use, time-limited
 * invite codes (not a long-lived secret). Uses the Web Crypto API, which
 * is available in both the Edge runtime and Node 18+. */
export function generateInviteToken(): string {
  const bytes = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  let token = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += TOKEN_ALPHABET[bytes[i] % TOKEN_ALPHABET.length];
  }
  return token;
}
