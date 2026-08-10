import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Purchases from 'react-native-purchases';

import { Collapsible } from '@/components/ui/collapsible';
import { PersonCard } from '@/components/person-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-states';
import { FeedbackModal } from '@/components/feedback-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { api, type GymClient } from '@/lib/api';
import { displayEmail } from '@/lib/auth';
import { NUTRITION_GOAL_LABELS } from '@/lib/goals';
import { supabase } from '@/lib/supabase';
import { clearLastDashboardChoice } from '@/lib/product-choice';
import { hasActiveEntitlement } from '@/lib/purchases';
import { registerForPushNotificationsAsync } from '@/lib/notifications';

// See adults/index.tsx's identical ADULTS_EXTRA_CAPACITY_ENTITLEMENT_ID for
// the full rationale — the coach_additional_person add-on's counterpart.
const COACH_EXTRA_CAPACITY_ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_COACH_EXTRA_CAPACITY_ENTITLEMENT_ID ?? 'coach_extra_capacity';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; clients: GymClient[]; removedClients: GymClient[]; extraCapacity: number }
  // Trial/subscription lapsed and no active RevenueCat entitlement — see
  // gym/paywall.tsx. Mirrors adults/index.tsx's identical gate, which
  // Coach never had until now (this workspace type's RevenueCat wiring —
  // "coach_premium" entitlement — was only just set up).
  | { status: 'subscription_required' };

// Mirrors the web app's GYM_CLIENT_LIMIT (src/lib/limits.ts) — see
// adults/index.tsx's identical FAMILY_MEMBER_LIMIT constant for why this
// client-side gate exists even though the DB trigger is what actually
// enforces it.
const GYM_CLIENT_LIMIT = 5;

function subtitleFor(client: GymClient): string | undefined {
  return client.nutritionGoals?.length ? client.nutritionGoals.map((g) => NUTRITION_GOAL_LABELS[g] ?? g).join(', ') : undefined;
}

function firstNameFromSession(email?: string | null): string {
  // gym accounts are never scoped (scopedEmail returns the email
  // unchanged for product="gym"), but stripping defensively here matches
  // adults/index.tsx's identical fix and costs nothing if there's no tag
  // to strip.
  return email ? displayEmail(email).split('@')[0] : 'there';
}

export default function GymClientListScreen() {
  const { session } = useAuth();
  const [showFeedback, setShowFeedback] = useState(false);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [buyingCapacity, setBuyingCapacity] = useState(false);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setState({ status: 'loading' });
    return Promise.all([api.getGymClients(), api.getRemovedGymClients(), api.getGymWorkspace()])
      .then(([{ clients }, { clients: removedClients }, { workspace, entitlement }]) => {
        if (entitlement.isReadOnly) {
          setState({ status: 'subscription_required' });
        } else {
          setState({ status: 'ready', clients, removedClients, extraCapacity: workspace.extraCapacity });
        }
      })
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load clients.' })
      );
  }, []);

  // useFocusEffect rather than a mount-only useEffect — see
  // adults/index.tsx's identical fix for the full rationale (stale list
  // after adding a client and coming back).
  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  // Registers (or refreshes) this device's push token once per mount —
  // no per-plan explanation card here yet (gym/coach notifications aren't
  // sent server-side yet either — see sendPushNotificationToProfile's call
  // sites), unlike adults/index.tsx's PushPermissionCard. Cheap no-op
  // server-side on repeat calls (upsert), and swallows all failures
  // internally (see notifications.ts).
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }

  function confirmRemove(client: GymClient) {
    Alert.alert(
      `Remove ${client.fullName}?`,
      "Their data will be preserved, but this frees up an active slot only — you can't add a replacement until next calendar month (removing doesn't refund this month's add quota).",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeGymClient(client.id);
              await load(false);
            } catch (err) {
              Alert.alert('Couldn\'t remove', err instanceof Error ? err.message : 'Please try again.');
            }
          },
        },
      ]
    );
  }

  // See adults/index.tsx's identical handleBuyCapacity for the full
  // rationale (Play/App Store purchase via RevenueCat, then poll briefly
  // for the webhook-updated extra_capacity before refreshing the list).
  async function handleBuyCapacity() {
    setBuyingCapacity(true);
    try {
      const offerings = await Purchases.getOfferings();
      const offering = offerings.all['coach_additional_person'];
      const pkg = offering?.availablePackages.find((p) => p.identifier === '$rc_monthly') ?? offering?.availablePackages[0];
      if (!pkg) {
        Alert.alert("Not available", "Extra capacity isn't available to purchase right now — please try again shortly.");
        return;
      }
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (hasActiveEntitlement(customerInfo, COACH_EXTRA_CAPACITY_ENTITLEMENT_ID)) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const { workspace } = await api.getGymWorkspace();
          if (workspace.extraCapacity > 0) break;
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
        await load(false);
      }
    } catch (err: any) {
      if (!err?.userCancelled) {
        Alert.alert("Couldn't complete purchase", 'Please try again.');
      }
    } finally {
      setBuyingCapacity(false);
    }
  }

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={() => load(true)} />;
  if (state.status === 'subscription_required') {
    return (
      <EmptyState
        title="Subscription needed"
        message="Your trial has ended — subscribe to keep tracking meals and progress for your clients."
        action={{ label: 'Subscribe', onPress: () => router.push('/gym/paywall') }}
      />
    );
  }

  const firstName = session?.user.user_metadata?.full_name?.split(' ')[0] ?? firstNameFromSession(session?.user.email);
  const clientLimit = GYM_CLIENT_LIMIT + Math.max(0, state.extraCapacity);
  const canAdd = state.clients.length < clientLimit;

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={state.clients}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          state.clients.length > 0 ? (
            <View style={styles.header}>
              <ThemedText type="small" themeColor="textSecondary">
                Good morning, {firstName}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.headline}>
                Your clients
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                See who is making progress and who may need attention today.
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Tip: press and hold a client to remove them.
              </ThemedText>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            image={require('@/assets/images/onboarding/coach.png')}
            title="Onboard your first client"
            message="Add a client and send them a WhatsApp invite. They just need to reply with their first meal, and you'll track their progress here."
            action={canAdd ? { label: 'Add client', onPress: () => router.push('/gym/add') } : undefined}
          />
        }
        renderItem={({ item }) => (
          <PersonCard
            fullName={item.fullName}
            subtitle={subtitleFor(item)}
            mealCount={item.mealCount}
            lastMealAt={item.lastMealAt}
            macroSummary={item.macroSummary}
            scoreQuery={{ clientId: item.id }}
            onPress={() => router.push(`/gym/${item.id}`)}
            onLongPress={() => confirmRemove(item)}
          />
        )}
        ListFooterComponent={
          <>
            {state.clients.length > 0 && canAdd && (
              <Pressable onPress={() => router.push('/gym/add')} style={styles.addCard}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.addCardText}>
                  + Add client
                </ThemedText>
              </Pressable>
            )}
            {state.clients.length > 0 && !canAdd && (
              <View style={styles.limitReachedCard}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.limitReachedText}>
                  You&apos;ve reached the limit of {clientLimit} client{clientLimit === 1 ? '' : 's'} for this account.
                </ThemedText>
                <Pressable onPress={handleBuyCapacity} disabled={buyingCapacity} style={styles.buyCapacityButton}>
                  {buyingCapacity ? (
                    <ActivityIndicator />
                  ) : (
                    <ThemedText type="smallBold" style={styles.buyCapacityText}>
                      Buy 1 more slot
                    </ThemedText>
                  )}
                </Pressable>
              </View>
            )}
            {state.removedClients.length > 0 && (
              <View style={styles.removedSection}>
                <Collapsible title={`Previous clients (${state.removedClients.length})`}>
                  {state.removedClients.map((client) => (
                    <PersonCard
                      key={client.id}
                      fullName={client.fullName}
                      subtitle={subtitleFor(client)}
                      mealCount={client.mealCount}
                      lastMealAt={client.lastMealAt}
                      scoreQuery={{ clientId: client.id }}
                      onPress={() => router.push(`/gym/${client.id}`)}
                      dimmed
                    />
                  ))}
                </Collapsible>
              </View>
            )}
          </>
        }
      />
      <View style={styles.footerRow}>
        <Pressable style={styles.footerButton} onPress={() => setShowFeedback(true)}>
          <ThemedText type="small" themeColor="textSecondary">
            Send feedback
          </ThemedText>
        </Pressable>
        <Pressable
          style={styles.footerButton}
          onPress={() => {
            clearLastDashboardChoice();
            supabase.auth.signOut();
          }}
        >
          <ThemedText type="small" themeColor="textSecondary">
            Sign out
          </ThemedText>
        </Pressable>
      </View>

      <FeedbackModal visible={showFeedback} onClose={() => setShowFeedback(false)} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingVertical: Spacing.three, flexGrow: 1 },
  header: { paddingHorizontal: Spacing.three, marginBottom: Spacing.three, gap: Spacing.one },
  headline: { fontSize: 24, lineHeight: 30, marginVertical: Spacing.one },
  hint: { marginTop: Spacing.one, fontStyle: 'italic' },
  addCard: {
    borderRadius: Spacing.three,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#C6C6CD',
    marginHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCardText: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  limitReachedCard: {
    borderRadius: Spacing.three,
    marginHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitReachedText: {
    textAlign: 'center',
  },
  buyCapacityButton: {
    marginTop: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    backgroundColor: '#5715CE',
  },
  buyCapacityText: {
    color: '#ffffff',
  },
  removedSection: { marginTop: Spacing.three, marginHorizontal: Spacing.three },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.three },
  footerButton: { alignItems: 'center', padding: Spacing.three },
});
