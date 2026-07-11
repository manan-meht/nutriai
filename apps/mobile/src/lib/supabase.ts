import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Expo inlines EXPO_PUBLIC_-prefixed vars from .env at build time — no
// app.config indirection needed (see .env.example).
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase config — set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in apps/mobile/.env (see .env.example)."
  );
}

// AsyncStorage-backed session (the standard Expo + Supabase pattern) — no
// cookies on a mobile client, so the session/JWT persists here instead and
// gets sent as an Authorization header (see src/lib/api.ts) rather than a
// cookie, unlike the web app's cookie-based session.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
