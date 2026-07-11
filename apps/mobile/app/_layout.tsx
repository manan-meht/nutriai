import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../src/lib/supabase";
import { detectTier } from "../src/lib/product";

// Required by expo-web-browser's OAuth auth-session flow (see
// src/lib/oauth.ts) — lets the in-app browser correctly dismiss itself
// once redirected back to the app, rather than being left open.
WebBrowser.maybeCompleteAuthSession();

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

    // Checking for these route names directly, rather than checking
    // segments[0] against a group name, since useSegments() doesn't
    // reliably include a group's name when its own *index* route matches
    // the current path (e.g. opening the app straight at "/") — that left
    // an earlier version of this redirect never firing.
    const onPreAuthScreen = segments[0] === "select-product" || segments[0] === "login";
    if (!session && !onPreAuthScreen) {
      // select-product, not a login screen, is the default landing screen
      // for a logged-out user — no marketing pages in this app.
      router.replace("/select-product");
    } else if (session && onPreAuthScreen) {
      // Self and Family share the same account scoping and can't be told
      // apart from the session alone — detectTier() fetches the workspace
      // to read workspace.plan. Runs on every login (not just OAuth) since
      // this is also what correctly routes an existing session on a cold
      // app start, regardless of which login screen was last used.
      detectTier().then((tier) => router.replace(`/(app)/${tier}`));
    }
  }, [session, segments, router]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
