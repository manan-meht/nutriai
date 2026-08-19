import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ProductPicker } from '@/components/product-picker';
import { Spacing, MaxContentWidth } from '@/constants/theme';
import { api, ApiError, type MyProductsResponse } from '@/lib/api';
import { consumePendingProductSelection, type PendingProduct } from '@/lib/product-intent';
import { clearLastDashboardChoice } from '@/lib/product-choice';
import { supabase } from '@/lib/supabase';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; products: MyProductsResponse; pendingProduct: PendingProduct | null };

export default function ProductRouterScreen() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    // Read (and clear) the card the user tapped on select-product.tsx, if
    // this mount is the direct result of that login — see
    // lib/product-intent.ts for why this exists and why it's read here
    // (async, SecureStore-backed) rather than a synchronous in-memory read:
    // /me/products checks both products against the same auth user id, so
    // an account seeded with both — or, just as importantly, a brand-new
    // account seeded with NEITHER yet — would otherwise ignore that choice
    // and ask again below.
    Promise.all([api.getMyProducts(), consumePendingProductSelection()])
      .then(([products, pendingProduct]) => {
        if (!cancelled) setState({ status: 'ready', products, pendingProduct });
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

  const { adults } = state.products;
  const { pendingProduct } = state;

  // One product, one destination. This screen used to arbitrate between an
  // adults and a gym dashboard — which product to open, which choice to
  // remember, which to re-ask about. Coaching is its own product now, on
  // its own domain and getting its own app, so all of that arbitration is
  // gone: a Tistra Health account has an adults workspace or it has none.
  if (adults) return <Redirect href="/adults" />;

  // No workspace yet — almost always a brand-new signup. GET
  // /adults/workspace get-or-creates as a side effect of being called, so
  // landing on the dashboard is what actually creates the workspace, and
  // the person can add their first family member from there.
  //
  // "self" vs "family" only decides the workspace plan (see mobile-api's
  // markWorkspaceSelfPlan). It is passed explicitly as '1' or '0' rather
  // than omitted — adults/index.tsx reads it via useLocalSearchParams, and
  // an omitted param can inherit a stale self=1 from an earlier navigation
  // to the same route, silently flipping a Family signup to the Self plan.
  if (pendingProduct) {
    return (
      <Redirect href={{ pathname: '/adults', params: { self: pendingProduct === 'self' ? '1' : '0' } }} />
    );
  }

  return (
    <ProductPicker
      headline="How will you use Tistra Health?"
      subhead="Choose the option that best fits you. You can change this later."
      onContinue={(selected) => {
        router.push({ pathname: '/adults', params: { self: selected === 'self' ? '1' : '0' } });
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
