import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../src/lib/supabase";

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === undefined) return; // still loading initial session

    const inAppGroup = segments[0] === "(app)";
    if (!session && inAppGroup) {
      router.replace("/login");
    } else if (session && !inAppGroup) {
      router.replace("/(app)");
    }
  }, [session, segments, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
