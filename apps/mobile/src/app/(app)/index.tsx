import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ProductPicker } from '@/components/product-picker';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { api, ApiError, type MyProductsResponse } from '@/lib/api';
import { consumePendingProductSelection } from '@/lib/product-intent';
import { getLastDashboardChoice, saveLastDashboardChoice, clearLastDashboardChoice, type DashboardChoice } from '@/lib/product-choice';
import { supabase } from '@/lib/supabase';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; products: MyProductsResponse; lastChoice: DashboardChoice | null };

export default function ProductRouterScreen() {
  const [state, setState] = useState<State>({ status: 'loading' });
  // Read (and clear) once on mount — the card the user tapped on
  // select-product.tsx, if this mount is the direct result of that login.
  // See lib/product-intent.ts for why this exists: /me/products checks
  // both products against the same auth user id, so an account seeded
  // with both would otherwise ignore that choice and ask again below.
  const [pendingProduct] = useState(() => consumePendingProductSelection());

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getMyProducts(), getLastDashboardChoice()])
      .then(([products, lastChoice]) => {
        if (!cancelled) setState({ status: 'ready', products, lastChoice });
      })
      .catch((err) => {
        if (cancelled) return;
        // A stale/expired session lands here as a 401 — sign out so the
        // root layout's auth gate sends them back to /login, rather than
        // getting stuck on an error screen with no way out.
        if (err instanceof ApiError && err.status === 401) {
          clearLastDashboardChoice();
          supabase.auth.signOut();
          return;
        }
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (state.status === 'error') {
    return (
      <ThemedView style={styles.centered}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="default" style={styles.errorText}>
            {state.message}
          </ThemedText>
          <Pressable
            style={styles.button}
            onPress={() => {
              clearLastDashboardChoice();
              supabase.auth.signOut();
            }}
          >
            <ThemedText style={styles.buttonText}>Sign out</ThemedText>
          </Pressable>
        </SafeAreaView>
      </ThemedView>
    );
  }

  const { adults, gym } = state.products;

  // Exactly one product — go straight there, no switcher needed.
  if (adults && !gym) return <Redirect href="/adults" />;
  if (gym && !adults) return <Redirect href="/gym" />;

  // Both, but the user just told select-product.tsx which one they meant —
  // honor that instead of asking again below, and persist it so the next
  // cold start (where pendingProduct is always null — it's in-memory only)
  // skips the picker too.
  if (adults && gym && pendingProduct) {
    const choice = pendingProduct === 'coach' ? 'gym' : 'adults';
    saveLastDashboardChoice(choice);
    return <Redirect href={choice === 'gym' ? '/gym' : '/adults'} />;
  }

  // Both, no fresh selection this session, but a persisted choice from a
  // previous one — go straight there instead of showing the picker again.
  // This is the actual fix for "every time I open the app I'm back on the
  // dashboard picker": pendingProduct never survives a cold start, but this
  // does (SecureStore, see lib/product-choice.ts).
  if (adults && gym && state.lastChoice) {
    return <Redirect href={state.lastChoice === 'gym' ? '/gym' : '/adults'} />;
  }

  // Neither — this account has no workspace on either product yet, most
  // often a brand-new signup (see app/signup.tsx) that hasn't picked a
  // product yet. This used to be a dead end telling people to go use the
  // website instead — wrong, since GET /adults/workspace and
  // GET /gym/workspace (see apps/mobile-api's route handlers) both
  // get-or-create the workspace as a side effect of being called at all,
  // the same way visiting either dashboard for the first time on the web
  // app does. So the picker below (normally only shown for an account with
  // BOTH products and no remembered choice) works just as well here —
  // picking one and landing on that dashboard is what actually creates the
  // workspace, letting the person add their first family member/client
  // from right there, same as this app's existing add.tsx screens already
  // support.
  if (!adults && !gym) {
    return (
      <ProductPicker
        headline="How will you use Tistra Health?"
        subhead="Choose the option that best fits you. You can change this later."
        onContinue={(selected) => {
          const choice = selected === 'coach' ? 'gym' : 'adults';
          saveLastDashboardChoice(choice);
          if (choice === 'gym') {
            router.push('/gym');
          } else {
            // "self" vs "family" only matters for the adults workspace's
            // plan (see mobile-api's markWorkspaceSelfPlan) — passed as a
            // one-time route param, same as the web signup flow's own
            // ?self=1, so adults/index.tsx can thread it through to its
            // first GET /adults/workspace call.
            router.push({ pathname: '/adults', params: selected === 'self' ? { self: '1' } : {} });
          }
        }}
      />
    );
  }

  // Both, and no fresh selection from select-product.tsx to honor (e.g. a
  // returning session restored straight into (app)) — reuse the exact same
  // picker as select-product.tsx rather than a differently-styled one;
  // "self" and "family" both resolve to /adults here since there's no
  // further distinction to make once already authenticated.
  return (
    <ProductPicker
      headline="Which dashboard?"
      subhead="Choose which one to view. You can switch anytime by signing out."
      onContinue={(selected) => {
        const choice = selected === 'coach' ? 'gym' : 'adults';
        saveLastDashboardChoice(choice);
        router.push(choice === 'gym' ? '/gym' : '/adults');
      }}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignItems: 'stretch',
  },
  errorText: {
    textAlign: 'center',
    marginBottom: Spacing.two,
  },
  button: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
