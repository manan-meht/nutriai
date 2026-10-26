import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';

import { Collapsible } from '@/components/ui/collapsible';
import { PersonCard } from '@/components/person-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-states';
import { FeedbackModal } from '@/components/feedback-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDashboardSwitch } from '@/hooks/use-dashboard-switch';
import { useAuth } from '@/lib/auth-context';
import { api, ApiError, type GymClient } from '@/lib/api';
import { displayEmail } from '@/lib/auth';
import { NUTRITION_GOAL_LABELS } from '@/lib/goals';
import { supabase } from '@/lib/supabase';
import { clearLastDashboardChoice } from '@/lib/product-choice';

// The coach view: a Coach-plan account's nutrition clients, the same list
// the web Coach OS Nutrition page shows (coach.tistra.club/nutrition).
// Clients log meals by WhatsApp and need no app; this is for the coach.
//
// Only reachable by an account that already owns a gym workspace — see
// lib/dashboard-route.ts. The Coach plan is bought and managed on the web,
// so unlike adults/index.tsx there is no paywall or extra-slot purchase
// here: the App Store and Play have no Coach products, and this app makes
// no purchase calls to action for it.

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      clients: GymClient[];
      removedClients: GymClient[];
      extraCapacity: number;
      entitlementStatus: string;
    }
  // isReadOnly comes from mobile-api's getEntitlementSnapshot, so the
  // server decides; this screen only stops offering writes it would refuse.
  | { status: 'read_only' };

// Mirrors the web app's GYM_CLIENT_LIMIT (src/lib/limits.ts) — the Coach
// plan includes 5 clients. The enforce_gym_client_limit DB trigger is what
// actually enforces it; this only hides "Add client" at the limit instead
// of letting someone fill in the form for an insert that will fail.
const GYM_CLIENT_LIMIT = 5;

function subtitleFor(client: GymClient): string | undefined {
  return client.nutritionGoals?.length ? client.nutritionGoals.map((g) => NUTRITION_GOAL_LABELS[g] ?? g).join(', ') : undefined;
}

function firstNameFromSession(email?: string | null): string {
  return email ? displayEmail(email).split('@')[0] : 'there';
}

/** Same boundaries as adults/index.tsx's greetingForHour. */
function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function GymClientListScreen() {
  const { session } = useAuth();
  const dashboardSwitch = useDashboardSwitch('gym');
  const [showFeedback, setShowFeedback] = useState(false);
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setState({ status: 'loading' });
    return Promise.all([api.getGymClients(), api.getRemovedGymClients(), api.getGymWorkspace()])
      .then(([{ clients }, { clients: removedClients }, { workspace, entitlement }]) => {
        if (entitlement.isReadOnly) {
          setState({ status: 'read_only' });
        } else {
          setState({
            status: 'ready',
            clients,
            removedClients,
            extraCapacity: workspace.extraCapacity,
            entitlementStatus: entitlement.status,
          });
        }
      })
      .catch((err) => {
        // Same as adults/index.tsx: an expired session arrives as a 401, and
        // "Try again" would only re-fail — signing out is what helps.
        if (err instanceof ApiError && err.status === 401) {
          clearLastDashboardChoice();
          supabase.auth.signOut();
          return;
        }
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load clients.' });
      });
  }, []);

  // useFocusEffect rather than a mount-only useEffect — this screen stays
  // mounted underneath add/invite/edit, see adults/index.tsx's identical fix.
  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

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

  // Long-press stands in for a per-row menu (see PersonCard). Resending the
  // invite lives here too: a client who lost the WhatsApp link has no other
  // way back in, and the coach is usually standing next to them.
  function showClientActions(client: GymClient) {
    Alert.alert(client.fullName, undefined, [
      {
        text: 'Send WhatsApp invite',
        onPress: () =>
          router.push({ pathname: '/gym/invite', params: { clientId: client.id, name: client.fullName.split(' ')[0] } }),
      },
      { text: 'Remove', style: 'destructive', onPress: () => confirmRemove(client) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const headerRight = dashboardSwitch
    ? () => (
        <Pressable onPress={dashboardSwitch.switchTo} hitSlop={8}>
          <ThemedText type="link">Health view</ThemedText>
        </Pressable>
      )
    : undefined;

  // Shared by the list and the read-only screen: every state the app can be
  // in has to reach Account (deletion) and sign-out — App Review 5.1.1(v),
  // same as adults/index.tsx.
  const footer = (
    <>
      <View style={styles.footerRow}>
        <Pressable style={styles.footerButton} onPress={() => setShowFeedback(true)}>
          <ThemedText type="small" themeColor="textSecondary">
            Send feedback
          </ThemedText>
        </Pressable>
        <Pressable style={styles.footerButton} onPress={() => router.push('/account')}>
          <ThemedText type="small" themeColor="textSecondary">
            Account
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
    </>
  );

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={() => load(true)} />;
  if (state.status === 'read_only') {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerRight }} />
        <EmptyState
          title="Coach plan not active"
          message="Nutrition tracking for your clients is paused. Your Coach plan is managed in Coach OS on the web."
        />
        {footer}
      </ThemedView>
    );
  }

  const firstName = session?.user.user_metadata?.full_name?.split(' ')[0] ?? firstNameFromSession(session?.user.email);
  const clientLimit = GYM_CLIENT_LIMIT + Math.max(0, state.extraCapacity);
  const atLimit = state.clients.length >= clientLimit;
  // The first client starts the Coach trial, and on the web that can mean
  // adding a card first (requiresCardBeforeFirstTrial). mobile-api's add
  // does neither, so a workspace that has never had a client sends its
  // first one through Coach OS, where the plan actually starts.
  const needsWebSetup = state.entitlementStatus === 'not_started';
  const canAdd = !atLimit && !needsWebSetup;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerRight }} />
      <FlatList
        data={state.clients}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          state.clients.length > 0 ? (
            <View style={styles.header}>
              <ThemedText type="small" themeColor="textSecondary">
                {greetingForHour(new Date().getHours())}, {firstName}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.headline}>
                Your clients
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                See who is making progress and who may need attention today.
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                Tip: press and hold a client to resend their invite or remove them.
              </ThemedText>
            </View>
          ) : null
        }
        ListEmptyComponent={
          needsWebSetup ? (
            <EmptyState
              image={require('@/assets/images/onboarding/coach.png')}
              title="Add your first client in Coach OS"
              message="Your first nutrition client is added from Coach OS on the web. After that, you can add clients and follow their meals here too."
            />
          ) : (
            <EmptyState
              image={require('@/assets/images/onboarding/coach.png')}
              title="Onboard your first client"
              message="Add a client and send them a WhatsApp invite. They just need to reply with their first meal, and you'll track their progress here."
              action={canAdd ? { label: 'Add client', onPress: () => router.push('/gym/add') } : undefined}
            />
          )
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
            onLongPress={() => showClientActions(item)}
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
                  {atLimit
                    ? `You've reached the limit of ${clientLimit} client${clientLimit === 1 ? '' : 's'} for this account.`
                    : // not_started with clients: only an older build's add
                      // (which never started the trial) leaves this state.
                      'New clients are added from Coach OS on the web for now.'}
                </ThemedText>
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
      {footer}
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
  removedSection: { marginTop: Spacing.three, marginHorizontal: Spacing.three },
  footerRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing.three },
  footerButton: { alignItems: 'center', padding: Spacing.three },
});
