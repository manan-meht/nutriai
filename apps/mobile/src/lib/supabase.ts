import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

// SecureStore (Keychain/Keystore-backed) rather than AsyncStorage — this
// holds the refresh token, which is long-lived and should get the same
// protection a password would, not plain unencrypted storage.
//
// The catch: a Supabase session serializes to well over SecureStore's
// 2048-byte guidance, and storing it whole logs "Value being stored in
// SecureStore is larger than 2048 bytes and it may not be stored
// successfully. In a future SDK version, this call may throw an error." on
// every write. When that becomes a throw, persistSession breaks and users
// get silently signed out. So anything oversized is split across
// `<key>.0`, `<key>.1`, … with a marker at `<key>` recording the count.
//
// Values written before this existed are plain strings at `<key>`, and
// getItem returns those untouched — no migration, no forced re-auth.
const CHUNK_MARKER = "__chunks__:";
/** Comfortably under the 2048-byte limit; session JSON is ASCII, so one
 * character is one byte here. */
const CHUNK_SIZE = 1536;

function chunkKey(key: string, i: number): string {
  return `${key}.${i}`;
}

/** Reads the chunk count a marker encodes, or null if `raw` isn't one. */
function chunkCountOf(raw: string): number | null {
  if (!raw.startsWith(CHUNK_MARKER)) return null;
  const count = Number.parseInt(raw.slice(CHUNK_MARKER.length), 10);
  return Number.isInteger(count) && count > 0 ? count : null;
}

async function deleteChunks(key: string, count: number): Promise<void> {
  await Promise.all(
    Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, i)))
  );
}

/** Existing chunk count for `key`, so a rewrite can clean up any chunks it
 * no longer needs (a shorter session must not leave a longer one's tail
 * behind, or the next read would splice in stale bytes). */
async function existingChunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(key);
  return raw ? (chunkCountOf(raw) ?? 0) : 0;
}

const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const raw = await SecureStore.getItemAsync(key);
    if (raw === null) return null;

    const count = chunkCountOf(raw);
    if (count === null) return raw; // plain value, including pre-chunking ones

    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, i)))
    );
    // A missing chunk means the stored session is unusable. Returning null
    // makes supabase-js treat it as "no session" and re-authenticate,
    // which is recoverable; returning a truncated string would not be.
    if (parts.some((p) => p === null)) return null;
    return parts.join("");
  },

  setItem: async (key: string, value: string): Promise<void> => {
    const staleChunks = await existingChunkCount(key);

    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      if (staleChunks > 0) await deleteChunks(key, staleChunks);
      return;
    }

    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }

    // Chunks first, marker last: if this is interrupted partway, the marker
    // still points at the previous complete set rather than a half-written
    // one.
    await Promise.all(chunks.map((part, i) => SecureStore.setItemAsync(chunkKey(key, i), part)));
    await SecureStore.setItemAsync(key, `${CHUNK_MARKER}${chunks.length}`);
    if (staleChunks > chunks.length) {
      await Promise.all(
        Array.from({ length: staleChunks - chunks.length }, (_, i) =>
          SecureStore.deleteItemAsync(chunkKey(key, chunks.length + i))
        )
      );
    }
  },

  removeItem: async (key: string): Promise<void> => {
    const count = await existingChunkCount(key);
    await SecureStore.deleteItemAsync(key);
    if (count > 0) await deleteChunks(key, count);
  },
};

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: SecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // The app has no server-rendered callback route to land a URL-based
      // session on (unlike the web app's /auth/callback) — OAuth results
      // are captured from the redirect URL directly in the auth flow code
      // instead (see src/lib/oauth.ts), so this must stay off.
      detectSessionInUrl: false,
    },
  }
);
