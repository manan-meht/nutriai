import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

// SecureStore (Keychain/Keystore-backed) rather than AsyncStorage — this
// holds the refresh token, which is long-lived and should get the same
// protection a password would, not plain unencrypted storage.
const SecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
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
