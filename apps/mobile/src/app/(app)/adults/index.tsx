import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { PersonCard } from '@/components/person-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { api, type AdultsContact } from '@/lib/api';
import { NUTRITION_GOAL_LABELS } from '@/lib/goals';
import { supabase } from '@/lib/supabase';
import { clearLastDashboardChoice } from '@/lib/product-choice';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; contacts: AdultsContact[] }
  // Trial/subscription lapsed and no active RevenueCat entitlement — see
  // adults/paywall.tsx. isReadOnly comes from getEntitlementSnapshot's
  // enforcement rule (mobile-api's lib/entitlements.ts), same computation
  // the web dashboard uses.
  | { status: 'subscription_required' };

const RELATIONSHIP_LABELS: Record<string, string> = {
  self: 'You',
  family_caregiver: 'Family member',
};

function subtitleFor(contact: AdultsContact): string {
  const relationship = contact.relationship || RELATIONSHIP_LABELS[contact.relationshipType] || 'Family member';
  const goal = contact.nutritionGoals?.length ? contact.nutritionGoals.map((g) => NUTRITION_GOAL_LABELS[g] ?? g).join(', ') : undefined;
  return goal ? `${relationship} · ${goal}` : relationship;
}

function firstNameFromSession(email?: string | null): string {
  return email?.split('@')[0] ?? 'there';
}

export default function AdultsContactListScreen() {
  const { session } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setState({ status: 'loading' });
    return Promise.all([api.getAdultsContacts(), api.getAdultsWorkspace()])
      .then(([{ contacts }, { entitlement }]) => {
        if (entitlement.isReadOnly) {
          setState({ status: 'subscription_required' });
        } else {
          setState({ status: 'ready', contacts });
        }
      })
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load contacts.' })
      );
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={() => load(true)} />;
  if (state.status === 'subscription_required') {
    return (
      <EmptyState
        title="Subscription needed"
        message="Your trial has ended — subscribe to keep tracking meals and progress for your family."
        action={{ label: 'Subscribe', onPress: () => router.push('/adults/paywall') }}
      />
    );
  }

  const firstName = session?.user.user_metadata?.full_name?.split(' ')[0] ?? firstNameFromSession(session?.user.email);

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={state.contacts}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          state.contacts.length > 0 ? (
            <View style={styles.header}>
              <ThemedText type="small" themeColor="textSecondary">
                Good morning, {firstName}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.headline}>
                Who would you like to check in on?
              </ThemedText>
              <ThemedText type="default" themeColor="textSecondary">
                Choose a family member to view their meals, progress, and recommendations.
              </ThemedText>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            title="Add someone you care about"
            message="Add a family member to support their nutrition journey."
            action={{ label: 'Add family member', onPress: () => router.push('/adults/add') }}
          />
        }
        renderItem={({ item }) => (
          <PersonCard
            fullName={item.fullName}
            subtitle={subtitleFor(item)}
            mealCount={item.mealCount}
            lastMealAt={item.lastMealAt}
            scoreQuery={{ contactId: item.id }}
            onPress={() => router.push(`/adults/${item.id}`)}
          />
        )}
        ListFooterComponent={
          state.contacts.length > 0 ? (
            <Pressable onPress={() => router.push('/adults/add')} style={styles.addCard}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.addCardText}>
                + Add family member
              </ThemedText>
            </Pressable>
          ) : null
        }
      />
      <Pressable
        style={styles.signOutButton}
        onPress={() => {
          clearLastDashboardChoice();
          supabase.auth.signOut();
        }}
      >
        <ThemedText type="small" themeColor="textSecondary">
          Sign out
        </ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { paddingVertical: Spacing.three, flexGrow: 1 },
  header: { paddingHorizontal: Spacing.three, marginBottom: Spacing.three, gap: Spacing.one },
  headline: { fontSize: 24, lineHeight: 30, marginVertical: Spacing.one },
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
  signOutButton: { alignItems: 'center', padding: Spacing.three },
});
