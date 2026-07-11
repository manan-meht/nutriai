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

    // Checking for these two routes by name, rather than checking whether
    // segments[0] === "(app)", since useSegments() doesn't reliably
    // include the group name when the group's own *index* route matches
    // the current path (e.g. opening the app straight at "/") — that left
    // an earlier version of this redirect never firing.
    const onPreAuthScreen = segments[0] === "select-product" || segments[0] === "login";
    if (!session && !onPreAuthScreen) {
      // select-product, not login, is the default landing screen for a
      // logged-out user — no marketing pages in this app, so this is
      // effectively "home" until they've picked a product and signed in.
      router.replace("/select-product");
    } else if (session && onPreAuthScreen) {
      router.replace("/(app)");
    }
  }, [session, segments, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
