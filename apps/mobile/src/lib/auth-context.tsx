import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface AuthContextValue {
  session: Session | null;
  /** True only during the initial session restore on app launch — never
   * true again after that, so screens don't need to re-show a full-screen
   * loader on every auth state change (e.g. token refresh). */
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Without a .catch()/.finally() here, a rejected getSession() call
    // (e.g. a SecureStore native-module error) left `loading` stuck at
    // `true` forever — the app never reached the login screen at all,
    // just hung on a blank/loading screen indefinitely. Always resolve
    // loading regardless of outcome; a failed restore just means "no
    // session," which correctly routes to /login.
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => setSession(session))
      .catch((err) => {
        console.error('[auth] getSession failed:', err);
        setSession(null);
      })
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ session, loading }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
