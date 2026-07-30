import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Purchases from 'react-native-purchases';

import { Collapsible } from '@/components/ui/collapsible';
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
import { hasActiveEntitlement } from '@/lib/purchases';
import { registerForPushNotificationsAsync } from '@/lib/notifications';
import { PushPermissionCard } from '@/components/push-permission-card';

// The RevenueCat entitlement + offering identifiers for the "buy 1 more
// slot" add-on (adults_additional_person, see this repo's RevenueCat setup
// notes) — mirrors ADULTS_ENTITLEMENT_ID's pattern in adults/paywall.tsx.
// Self plan workspaces never see this (always exactly 1 person, no
// concept of extra capacity), only Family.
const ADULTS_EXTRA_CAPACITY_ENTITLEMENT_ID = process.env.EXPO_PUBLIC_REVENUECAT_ADULTS_EXTRA_CAPACITY_ENTITLEMENT_ID ?? 'adults_extra_capacity';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      contacts: AdultsContact[];
      removedContacts: AdultsContact[];
      extraCapacity: number;
      plan: string;
      entitlementStatus: string;
      trialDaysRemaining: number | null;
      requiresCardBeforeTrial: boolean;
      isBillingWhitelisted: boolean;
    }
  // Trial/subscription lapsed and no active RevenueCat entitlement — see
  // adults/paywall.tsx. isReadOnly comes from getEntitlementSnapshot's
  // enforcement rule (mobile-api's lib/entitlements.ts), same computation
  // the web dashboard uses.
  | { status: 'subscription_required'; plan: string };

// Mirrors the web app's FAMILY_MEMBER_LIMIT (src/lib/limits.ts) — the
// server-side DB trigger (migrations 0002-0004) is the actual
// authoritative enforcement regardless of what this screen does or
// doesn't check (a failed insert past this limit is always safely
// rejected server-side), but without this client-side gate the mobile app
// still let someone tap through the entire "Add family member" form only
// to have it fail at submit — this matches web's canAdd, which hides the
// button entirely once the limit is reached instead.
const FAMILY_MEMBER_LIMIT = 2;

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
  // Only ever set (to "1") the one time (app)/index.tsx's product picker
  // routes here right after someone picks "Self" for a brand-new signup —
  // see getAdultsWorkspace's own doc comment for why this needs to reach
  // the server at all. Harmless to keep sending on every load() call
  // (refresh, etc.): mobile-api's markWorkspaceSelfPlan is a no-op once the
  // workspace is already "self".
  const { self: selfParam, justPurchased } = useLocalSearchParams<{ self?: string; justPurchased?: string }>();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [refreshing, setRefreshing] = useState(false);
  const [buyingCapacity, setBuyingCapacity] = useState(false);

  const load = useCallback((showSpinner: boolean) => {
    if (showSpinner) setState({ status: 'loading' });
    return Promise.all([api.getAdultsContacts(), api.getRemovedAdultsContacts(), api.getAdultsWorkspace({ self: selfParam === '1' })])
      .then(([{ contacts }, { contacts: removedContacts }, { workspace, entitlement }]) => {
        if (entitlement.isReadOnly) {
          setState({ status: 'subscription_required', plan: workspace.plan });
        } else {
          setState({
            status: 'ready',
            contacts,
            removedContacts,
            extraCapacity: workspace.extraCapacity,
            plan: workspace.plan,
            entitlementStatus: entitlement.status,
            trialDaysRemaining: entitlement.trialDaysRemaining,
            requiresCardBeforeTrial: entitlement.requiresCardBeforeTrial,
            isBillingWhitelisted: entitlement.isBillingWhitelisted,
          });
        }
      })
      .catch((err) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Failed to load contacts.' })
      );
  }, [selfParam]);

  // useFocusEffect rather than a mount-only useEffect — this screen stays
  // mounted underneath add.tsx/the invite screen, so a plain useEffect
  // never re-ran after adding a family member and coming back (stale list
  // until a full app restart — same class of bug as
  // adults/[contactId].tsx's identical fix). load(false) rather than
  // load(true) here: on first mount `state` already starts as 'loading'
  // (see useState above) so the spinner still shows correctly, but on
  // every later focus this refreshes silently in the background instead
  // of flashing a full-screen spinner over an already-visible list.
  useFocusEffect(
    useCallback(() => {
      load(false);
    }, [load])
  );

  // paywall.tsx's own post-purchase poll gives up after ~6s if the
  // RevenueCat webhook that flips requiresCardBeforeTrial hasn't landed yet
  // — this picks up where that leaves off instead of leaving the "add a
  // payment method" banner (and the subscribe→add-member→paywall loop)
  // stuck until the user backgrounds/foregrounds the app or force-refreshes.
  const stillRequiresCardAfterPurchase = justPurchased === '1' && state.status === 'ready' && state.requiresCardBeforeTrial;
  useEffect(() => {
    if (!stillRequiresCardAfterPurchase) return;
    const interval = setInterval(() => load(false), 2500);
    const timeout = setTimeout(() => clearInterval(interval), 30000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [stillRequiresCardAfterPurchase, load]);

  // Self-plan accounts aren't sent any push notifications yet (see
  // notifyCaregiverOfFamilyMeal in src/lib/whatsapp/conversation-handler.ts,
  // scoped to workspace.plan === 'family' only), so there's nothing
  // truthful to explain in a permission-priming card here — keep the old
  // silent registration for self so an already-granted device's token
  // still gets refreshed, without inventing a reason for a permission
  // prompt that wouldn't lead to any actual notification today. Family
  // plan's push explanation is PushPermissionCard below instead.
  const plan = state.status === 'ready' || state.status === 'subscription_required' ? state.plan : null;
  useEffect(() => {
    if (plan === 'self') registerForPushNotificationsAsync();
  }, [plan]);

  async function onRefresh() {
    setRefreshing(true);
    await load(false);
    setRefreshing(false);
  }

  function confirmRemove(contact: AdultsContact) {
    Alert.alert(
      `Remove ${contact.fullName}?`,
      "Their data will be preserved, but this frees up an active slot only — you can't add a replacement until next calendar month (removing doesn't refund this month's add quota).",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.removeAdultsContact(contact.id);
              await load(false);
            } catch (err) {
              Alert.alert('Couldn\'t remove', err instanceof Error ? err.message : 'Please try again.');
            }
          },
        },
      ]
    );
  }

  // Buys one more family-member slot via Play/App Store billing (the
  // "adults_additional_person" product, see this repo's RevenueCat setup
  // notes) — the persisted extra_capacity column is only ever updated by
  // the RevenueCat webhook, so this polls briefly after a successful
  // purchase the same way adults/paywall.tsx's waitForEntitlementThenReturn
  // does, rather than trusting the client-side purchase result alone.
  async function handleBuyCapacity() {
    setBuyingCapacity(true);
    try {
      const offerings = await Purchases.getOfferings();
      const offering = offerings.all['additional_person'];
      const pkg = offering?.availablePackages.find((p) => p.identifier === '$rc_monthly') ?? offering?.availablePackages[0];
      if (!pkg) {
        Alert.alert("Not available", "Extra capacity isn't available to purchase right now — please try again shortly.");
        return;
      }
      const { customerInfo } = await Purchases.purchasePackage(pkg);
      if (hasActiveEntitlement(customerInfo, ADULTS_EXTRA_CAPACITY_ENTITLEMENT_ID)) {
        for (let attempt = 0; attempt < 5; attempt++) {
          const { workspace } = await api.getAdultsWorkspace();
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

  // "Add family member" opens the add form directly, EXCEPT for a
  // brand-new workspace that must go through Play/App Store checkout
  // first (requiresCardBeforeTrial) — those get sent to the paywall
  // instead, mirroring the web app's handleAddClick
  // (src/components/adults/AdultsDashboardClient.tsx). The paywall itself
  // starts the trial the moment the purchase sheet is approved; nothing
  // else here needs to "start" it.
  function handleAddPress(plan: string, requiresCardBeforeTrial: boolean) {
    if (requiresCardBeforeTrial) {
      // Someone who just subscribed but whose webhook hasn't landed yet
      // would otherwise get bounced straight back to the paywall they just
      // completed — this is the reported subscribe→add-member→paywall loop.
      // The background poll above (stillRequiresCardAfterPurchase) is
      // already retrying; ask them to wait a moment instead of re-showing
      // a screen that looks like their purchase didn't go through.
      if (stillRequiresCardAfterPurchase) {
        Alert.alert(
          'Just a moment',
          "We're still confirming your subscription — this can take a few seconds. Please try again shortly."
        );
        return;
      }
      router.push({ pathname: '/adults/paywall', params: { plan } });
    } else {
      router.push('/adults/add');
    }
  }

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={() => load(true)} />;
  if (state.status === 'subscription_required') {
    return (
      <>
        <Stack.Screen options={{ title: state.plan === 'self' ? 'You' : 'Family' }} />
        <EmptyState
          title="Subscription needed"
          message="Your trial has ended — subscribe to keep tracking meals and progress for your family."
          action={{ label: 'Subscribe', onPress: () => router.push({ pathname: '/adults/paywall', params: { plan: state.plan } }) }}
        />
      </>
    );
  }

  const firstName = session?.user.user_metadata?.full_name?.split(' ')[0] ?? firstNameFromSession(session?.user.email);
  const familyLimit = FAMILY_MEMBER_LIMIT + Math.max(0, state.extraCapacity);
  const canAdd = state.contacts.length < familyLimit;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: state.plan === 'self' ? 'You' : 'Family' }} />
      <FlatList
        data={state.contacts}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            {state.contacts.length > 0 && (
              <View style={styles.header}>
                <ThemedText type="small" themeColor="textSecondary">
                  Good morning, {firstName}
                </ThemedText>
                <ThemedText type="subtitle" style={styles.headline}>
                  {state.plan === 'self' ? 'Your dashboard' : 'Who would you like to check in on?'}
                </ThemedText>
                <ThemedText type="default" themeColor="textSecondary">
                  {state.plan === 'self'
                    ? 'Tap below to view your meals, progress, and recommendations.'
                    : 'Choose a family member to view their meals, progress, and recommendations.'}
                </ThemedText>
                {state.plan !== 'self' && (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                    Tip: press and hold a family member to remove them.
                  </ThemedText>
                )}
              </View>
            )}
            {state.plan === 'family' && <PushPermissionCard message="when a loved one logs a meal" />}
            {state.isBillingWhitelisted ? (
              // Takes priority over every other banner — a whitelisted
              // test account should never see payment prompts or a trial
              // countdown, since neither is real for this account.
              <ThemedView type="backgroundElement" style={styles.trialBanner}>
                <ThemedText type="small">You have a whitelisted test account — no payment is needed to use Tistra Health.</ThemedText>
              </ThemedView>
            ) : stillRequiresCardAfterPurchase ? (
              <ThemedView type="backgroundElement" style={styles.trialBanner}>
                <ThemedText type="small">Confirming your subscription — this can take a few seconds…</ThemedText>
              </ThemedView>
            ) : state.requiresCardBeforeTrial ? (
              <ThemedView type="backgroundElement" style={styles.trialBanner}>
                <ThemedText type="small">
                  Add a payment method to start your free 14-day trial — you won&apos;t be charged until it ends, and you can
                  cancel anytime before then.
                </ThemedText>
              </ThemedView>
            ) : state.entitlementStatus === 'trialing' && state.trialDaysRemaining !== null ? (
              <ThemedView type="backgroundElement" style={styles.trialBanner}>
                <ThemedText type="small">
                  Free trial — {state.trialDaysRemaining} day{state.trialDaysRemaining === 1 ? '' : 's'} remaining.
                </ThemedText>
              </ThemedView>
            ) : null}
          </>
        }
        ListEmptyComponent={
          state.plan === 'self' ? (
            <EmptyState
              image={require('@/assets/images/onboarding/self.png')}
              title="Set up your profile"
              message="Add your own details so Tistra can start tracking your meals, progress, and recommendations."
              action={
                canAdd
                  ? { label: 'Get started', onPress: () => handleAddPress(state.plan, state.requiresCardBeforeTrial) }
                  : undefined
              }
            />
          ) : (
            <EmptyState
              image={require('@/assets/images/onboarding/family.png')}
              title="Add someone you care about"
              message="Invite a family member so you can support their nutrition journey. Share plans, track progress, and grow healthier together."
              action={
                canAdd
                  ? { label: 'Add family member', onPress: () => handleAddPress(state.plan, state.requiresCardBeforeTrial) }
                  : undefined
              }
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
            scoreQuery={{ contactId: item.id }}
            onPress={() => router.push(`/adults/${item.id}`)}
            onLongPress={() => confirmRemove(item)}
          />
        )}
        ListFooterComponent={
          <>
            {state.contacts.length > 0 && canAdd && (
              // Once a self-plan account already has its one "self" contact,
              // any further addition genuinely is a family member (self
              // plans don't have a second "self" concept) — this label
              // stays unconditional on purpose.
              <Pressable onPress={() => handleAddPress(state.plan, state.requiresCardBeforeTrial)} style={styles.addCard}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.addCardText}>
                  + Add family member
                </ThemedText>
              </Pressable>
            )}
            {state.contacts.length > 0 && !canAdd && (
              <View style={styles.limitReachedCard}>
                <ThemedText type="small" themeColor="textSecondary" style={styles.limitReachedText}>
                  {state.plan === 'self'
                    ? "You've reached the limit for this account."
                    : `You've reached the limit of ${familyLimit} family member${familyLimit === 1 ? '' : 's'} for this account.`}
                </ThemedText>
                {state.plan !== 'self' && (
                  <Pressable onPress={handleBuyCapacity} disabled={buyingCapacity} style={styles.buyCapacityButton}>
                    {buyingCapacity ? (
                      <ActivityIndicator />
                    ) : (
                      <ThemedText type="smallBold" style={styles.buyCapacityText}>
                        Buy 1 more slot
                      </ThemedText>
                    )}
                  </Pressable>
                )}
              </View>
            )}
            {state.removedContacts.length > 0 && (
              <View style={styles.removedSection}>
                <Collapsible title={`Previous family members (${state.removedContacts.length})`}>
                  {state.removedContacts.map((contact) => (
                    <PersonCard
                      key={contact.id}
                      fullName={contact.fullName}
                      subtitle={subtitleFor(contact)}
                      mealCount={contact.mealCount}
                      lastMealAt={contact.lastMealAt}
                      scoreQuery={{ contactId: contact.id }}
                      onPress={() => router.push(`/adults/${contact.id}`)}
                      dimmed
                    />
                  ))}
                </Collapsible>
              </View>
            )}
          </>
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
  trialBanner: {
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
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
  addCardText: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  removedSection: { marginTop: Spacing.three, marginHorizontal: Spacing.three },
  signOutButton: { alignItems: 'center', padding: Spacing.three },
});
