import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { PersonCard } from '@/components/person-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/screen-states';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { api, type GymClient } from '@/lib/api';
import { NUTRITION_GOAL_LABELS } from '@/lib/goals';
import { supabase } from '@/lib/supabase';
import { clearLastDashboardChoice } from '@/lib/product-choice';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; clients: GymClient[] };

function subtitleFor(client: GymClient): string | undefined {
  return client.nutritionGoals?.length ? client.nutritionGoals.map((g) => NUTRITION_GOAL_LABELS[g] ?? g).join(', ') : undefined;
}

function firstNameFromSession(email?: string | null): string {
  return email?.split('@')[0] ?? 'there';
}

export default function GymClientListScreen() {
  const { session } = useAuth();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setState({ status: 'loading' });
    return api
      .getGymClients()
      .then(({ clients }) => setState({ status: 'ready', clients }))
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load clients.' })
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

  const firstName = session?.user.user_metadata?.full_name?.split(' ')[0] ?? firstNameFromSession(session?.user.email);

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
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyState
            title="Onboard your first client"
            message="Add a client to start tracking their meals, progress, and recommendations."
            action={{ label: 'Add client', onPress: () => router.push('/gym/add') }}
          />
        }
        renderItem={({ item }) => (
          <PersonCard
            fullName={item.fullName}
            subtitle={subtitleFor(item)}
            mealCount={item.mealCount}
            lastMealAt={item.lastMealAt}
            scoreQuery={{ clientId: item.id }}
            onPress={() => router.push(`/gym/${item.id}`)}
          />
        )}
        ListFooterComponent={
          state.clients.length > 0 ? (
            <Pressable onPress={() => router.push('/gym/add')} style={styles.addCard}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.addCardText}>
                + Add client
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
