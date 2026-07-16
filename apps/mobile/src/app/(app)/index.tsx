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

  // Neither — this account has no workspace on either product yet. Can
  // happen for a brand-new signup that hasn't added a family member/client
  // on the web app yet (this app is read-only — see apps/mobile-api's
  // README — so there's no "add your first one" flow to offer here).
  if (!adults && !gym) {
    return (
      <ThemedView style={styles.centered}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedText type="subtitle" style={styles.errorText}>
            No dashboard yet
          </ThemedText>
          <ThemedText type="default" themeColor="textSecondary" style={styles.errorText}>
            This account isn't set up on Family or Coach yet. Use tistrahealth.com to get started, then come
            back here.
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
