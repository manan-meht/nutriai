import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import Purchases, { type PurchasesOffering, type PurchasesPackage } from 'react-native-purchases';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { hasActiveEntitlement } from '@/lib/purchases';

// The RevenueCat entitlement identifier that grants Coach (module "gym")
// access — mirrors adults/paywall.tsx's ADULTS_ENTITLEMENT_ID exactly,
// just a separate entitlement since Coach is a distinct workspace type.
const COACH_ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_COACH_ENTITLEMENT_ID ?? 'coach_premium';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; offering: PurchasesOffering | null };

/** Coach paywall — shown by gym/index.tsx in place of the client list once
 * the workspace's entitlement is read-only (trial/subscription lapsed).
 * A near-exact mirror of adults/paywall.tsx; kept as a separate file
 * rather than a shared parameterized component since the two already
 * diverge in copy/entitlement/dashboard-return-path, and RevenueCat
 * purchases are a rare enough surface that a little duplication here is
 * clearer than a shared abstraction bent to fit both. */
export default function GymPaywallScreen() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [purchasingId, setPurchasingId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(() => {
    setState({ status: 'loading' });
    Purchases.getOfferings()
      .then((offerings) => setState({ status: 'ready', offering: offerings.all['coach'] ?? null }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Could not load plans.' })
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Same "poll briefly, then return" pattern as the adults paywall — see
   * that file's own comment for why this doesn't just trust the
   * client-side purchase result. */
  async function waitForEntitlementThenReturn() {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { entitlement } = await api.getGymWorkspace();
        if (!entitlement.isReadOnly) break;
      } catch {
        // keep retrying — a transient network error here shouldn't strand
        // the user on the paywall after a successful purchase.
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    router.replace('/gym');
  }

  async function handlePurchase(pkg: PurchasesPackage) {
    setPurchasingId(pkg.identifier);
    try {
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (hasActiveEntitlement(customerInfo, COACH_ENTITLEMENT_ID)) {
        await waitForEntitlementThenReturn();
      }
    } catch (err: any) {
      if (!err?.userCancelled) {
        setState({ status: 'error', message: 'Purchase failed. Please try again.' });
      }
    } finally {
      setPurchasingId(null);
    }
  }

  async function handleRestore() {
    setRestoring(true);
    try {
      const customerInfo = await Purchases.restorePurchases();
      if (hasActiveEntitlement(customerInfo, COACH_ENTITLEMENT_ID)) {
        await waitForEntitlementThenReturn();
      } else {
        setState({ status: 'error', message: 'No active subscription found for this account.' });
      }
    } catch {
      setState({ status: 'error', message: 'Could not restore purchases. Please try again.' });
    } finally {
      setRestoring(false);
    }
  }

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
        <ThemedText type="default" style={styles.text}>
          {state.message}
        </ThemedText>
        <Pressable style={styles.primaryButton} onPress={load}>
          <ThemedText style={styles.primaryButtonText}>Try again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const packages = state.offering?.availablePackages ?? [];

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="subtitle" style={styles.headline}>
        Continue coaching your clients
      </ThemedText>
      <ThemedText type="default" themeColor="textSecondary" style={styles.text}>
        Subscribe to keep tracking meals, Food Balance Score, and recommendations for your clients.
      </ThemedText>

      {packages.length === 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.text}>
          Plans aren&apos;t available right now — please try again shortly.
        </ThemedText>
      )}

      <ThemedView style={styles.packages}>
        {packages.map((pkg) => (
          <Pressable
            key={pkg.identifier}
            style={styles.packageCard}
            disabled={purchasingId !== null}
            onPress={() => handlePurchase(pkg)}
          >
            <ThemedText type="smallBold">{pkg.product.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {pkg.product.priceString}
            </ThemedText>
            {purchasingId === pkg.identifier && <ActivityIndicator style={styles.packageSpinner} />}
          </Pressable>
        ))}
      </ThemedView>

      <Pressable style={styles.restoreButton} onPress={handleRestore} disabled={restoring}>
        <ThemedText type="small" themeColor="textSecondary">
          {restoring ? 'Restoring…' : 'Restore purchases'}
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Spacing.four, gap: Spacing.three },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  headline: { fontSize: 22, lineHeight: 28 },
  text: { textAlign: 'left' },
  packages: { gap: Spacing.two, marginTop: Spacing.two },
  packageCard: {
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: '#C6C6CD',
    padding: Spacing.three,
  },
  packageSpinner: { marginTop: Spacing.one },
  primaryButton: {
    backgroundColor: '#5715CE',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  primaryButtonText: { color: '#ffffff', fontWeight: '600' },
  restoreButton: { alignItems: 'center', padding: Spacing.three, marginTop: 'auto' },
});
