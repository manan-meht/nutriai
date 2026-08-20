// Encryption for stored Google refresh tokens.
//
// The schema (migration 0056) requires these encrypted at the application
// layer: a refresh token is a long-lived key to a coach's calendar, and a
// database dump must not hand one over in plaintext. AES-GCM via Web
// Crypto, which works unchanged on Workers — no Node crypto module.
//
// The key lives in CLUB_CALENDAR_TOKEN_KEY (base64, 32 bytes). Rotating it
// invalidates stored tokens, which surfaces as needs_reauth rather than
// silent breakage — coaches reconnect, nothing is lost but the connection.

const IV_BYTES = 12;

function keyMaterial(): Uint8Array {
  const raw = process.env.CLUB_CALENDAR_TOKEN_KEY;
  if (!raw) throw new Error("CLUB_CALENDAR_TOKEN_KEY is not configured");
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.length !== 32) throw new Error("CLUB_CALENDAR_TOKEN_KEY must be 32 bytes, base64-encoded");
  return bytes;
}

async function aesKey(usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", keyMaterial().buffer as ArrayBuffer, { name: "AES-GCM" }, false, usage);
}

/** Returns base64 of iv || ciphertext, so one column round-trips. */
export async function encryptToken(plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await aesKey(["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext))
  );
  const joined = new Uint8Array(iv.length + cipher.length);
  joined.set(iv);
  joined.set(cipher, iv.length);
  return btoa(String.fromCharCode(...joined));
}

/** Returns null rather than throwing when a value can't be decrypted — a
 * rotated key or a corrupt row should mean "reconnect", not a 500 on a
 * page that merely wanted to know whether a calendar is attached. */
export async function decryptToken(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  try {
    const bytes = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    const iv = bytes.slice(0, IV_BYTES);
    const cipher = bytes.slice(IV_BYTES);
    const key = await aesKey(["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export function calendarTokenKeyConfigured(): boolean {
  return !!process.env.CLUB_CALENDAR_TOKEN_KEY;
}
