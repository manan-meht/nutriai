import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { GM, GM_TAP } from '@/constants/guidance-theme';
import { api } from '@/lib/api';
import { fmt } from '@/lib/guidance-format';
import { hasRequiredDetails, initialSetupForm, setupFormToAnswers, validateSetupForm, type SetupFormProblem, type SetupFormState } from '@/lib/guidance-setup-form';
import type {
  ActivationFailure,
  ConfirmResult,
  DeclinedPolicy,
  GuidanceActionResult,
  GuidanceOp,
  GuidancePerson,
  GuidanceSubject,
  GuidanceView,
  ProposalResult,
} from '@/lib/guidance-types';

import { GuidanceSetupForm } from './guidance-setup-form';
import { Card, Chevron, ErrorLine, GText, Note, PrimaryButton, QuietButton, SecondaryButton } from './ui';
import { GENERIC_ERROR, useGuidanceData } from './use-guidance';

// The Guidance setup screen, for every viewer. Mirrors the web's
// GuidancePanel.tsx. Which branch renders was decided on the server; this
// only steps through the setup flow inside the branch it was given:
//
//   answers → review of proposed targets → confirm
//
// Confirm sends the answers again, not the targets shown at review: the
// server recomputes them, so the numbers shown can't come back altered.

type Proposal = Extract<ProposalResult, { ok: true }>;
type Post = (op: GuidanceOp, body?: Record<string, unknown>) => Promise<GuidanceActionResult>;

function failureMessage(result: ActivationFailure): string {
  if (result.kind === 'forbidden' || result.kind === 'unavailable' || result.kind === 'write_failed') return result.message;
  if (result.kind === 'declined') return result.policy.message;
  if (result.kind === 'request_failed') return result.message || GENERIC_ERROR;
  return GENERIC_ERROR;
}

/** Guidance mode is a beta: said at the top of its pages, always. Until the
 * target policy is clinically reviewed it also says the targets haven't
 * been checked. */
function PreviewBanner({ unreviewed = true }: { unreviewed?: boolean }) {
  return (
    <Note>
      <GText variant="small" tone="over" bold>
        Beta: Guidance mode is still being tested
      </GText>
      <GText variant="small" tone="over" style={{ marginTop: 4, opacity: 0.85 }}>
        {unreviewed
          ? "A qualified health professional hasn't yet reviewed how Tistra works out these targets. Treat them as a starting point, not medical advice, and don't use them to make big changes to anyone's diet."
          : "Things may change as it's improved. Targets and estimates are a starting point, not medical advice."}
      </GText>
    </Note>
  );
}

function Notice({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Card>
      {title ? (
        <GText variant="h3" accessibilityRole="header" style={{ marginBottom: 4 }}>
          {title}
        </GText>
      ) : null}
      <View style={{ gap: 8 }}>{children}</View>
    </Card>
  );
}

function TargetsReview({ proposal, person }: { proposal: Proposal; person: GuidancePerson }) {
  const [howOpen, setHowOpen] = useState(false);
  const t = proposal.targets;
  const items = [
    { label: 'Protein', value: `${t.proteinG} g` },
    { label: 'Carbs', value: `${t.carbsG} g` },
    { label: 'Fat', value: `${t.fatG} g` },
    { label: 'Fiber', value: `${t.fiberG} g` },
  ];
  const calories = `${fmt(t.caloriesKcal)} kcal`;
  return (
    <Card style={{ gap: 14 }}>
      <View>
        <GText variant="h3" accessibilityRole="header">
          {person.isSelf ? 'Your proposed daily targets' : `Proposed daily targets for ${person.name}`}
        </GText>
        <GText variant="small" tone="muted" style={{ marginTop: 4 }}>
          Nothing is switched on until you confirm.
        </GText>
      </View>
      <View style={styles.tileCalories} accessible accessibilityLabel={`Calories: ${calories}`}>
        <GText variant="caption" tone="secondary">
          Calories
        </GText>
        <GText variant="h2" tone="accent" style={{ fontVariant: ['tabular-nums'] }}>
          {calories}
        </GText>
      </View>
      <View style={styles.tiles}>
        {items.map((item) => (
          <View key={item.label} style={styles.tile} accessible accessibilityLabel={`${item.label}: ${item.value}`}>
            <GText variant="caption" tone="secondary">
              {item.label}
            </GText>
            <GText variant="body" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {item.value}
            </GText>
          </View>
        ))}
      </View>
      {proposal.notes.length > 0 && (
        <View style={{ gap: 6 }}>
          {proposal.notes.map((note) => (
            <Note key={note} style={{ paddingVertical: 8, paddingHorizontal: 12 }}>
              <GText variant="small" tone="over">
                {note}
              </GText>
            </Note>
          ))}
        </View>
      )}
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: howOpen }}
          onPress={() => setHowOpen((o) => !o)}
          style={styles.disclosure}
        >
          <GText variant="small" style={{ fontWeight: '600', flex: 1 }}>
            How these were calculated
          </GText>
          <Chevron direction={howOpen ? 'up' : 'down'} size={18} />
        </Pressable>
        {howOpen && (
          <View style={{ gap: 6 }}>
            <GText variant="small" tone="secondary">
              {proposal.explanation}
            </GText>
            <GText variant="caption" tone="muted">
              Policy {proposal.policyVersion}
            </GText>
          </View>
        )}
      </View>
    </Card>
  );
}

function SetupFlow({
  view,
  post,
  onActivated,
  onCancel,
  scrollToTop,
}: {
  view: Extract<GuidanceView, { kind: 'setup' }>;
  post: Post;
  onActivated: () => void;
  onCancel: () => void;
  scrollToTop: () => void;
}) {
  const [form, setForm] = useState<SetupFormState>(() => initialSetupForm(view.prefill));
  // Opens as a form only when the profile is missing something required.
  const [editingDetails, setEditingDetails] = useState(() => !hasRequiredDetails(initialSetupForm(view.prefill)));
  const [step, setStep] = useState<'answers' | 'review' | 'declined'>('answers');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [declined, setDeclined] = useState<DeclinedPolicy | null>(null);
  const [problem, setProblem] = useState<SetupFormProblem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { person } = view;
  const changeAnswers = person.isSelf ? 'Change my answers' : 'Change the answers';

  function go(next: 'answers' | 'review' | 'declined') {
    setStep(next);
    scrollToTop();
  }

  function handleFailure(result: ActivationFailure) {
    if (result.kind === 'declined') {
      setDeclined(result.policy);
      go('declined');
    } else {
      setError(failureMessage(result));
    }
  }

  function submitAnswers() {
    setError(null);
    const found = validateSetupForm(form);
    setProblem(found);
    if (found) {
      if (found.field === 'details') setEditingDetails(true);
      return;
    }
    setPending(true);
    post('propose', { answers: setupFormToAnswers(form) })
      .then((r) => {
        const result = r as unknown as ProposalResult;
        if (!result.ok) return handleFailure(result);
        setProposal(result);
        go('review');
      })
      .catch(() => setError(GENERIC_ERROR))
      .finally(() => setPending(false));
  }

  function confirmTargets() {
    setError(null);
    setPending(true);
    post('confirm', { answers: setupFormToAnswers(form) })
      .then((r) => {
        const result = r as unknown as ConfirmResult;
        if (!result.ok) return handleFailure(result);
        // The person's screen reloads as the Guidance view on the way back.
        onActivated();
      })
      .catch(() => setError(GENERIC_ERROR))
      .finally(() => setPending(false));
  }

  if (step === 'declined' && declined) {
    return (
      <View style={styles.stack}>
        <Notice
          title={declined.outcome === 'needs_more_detail' ? 'A few more details needed' : `We won't set targets for ${person.isSelf ? 'you' : person.name}`}
        >
          <GText variant="small" tone="secondary">
            {declined.message}
          </GText>
        </Notice>
        <SecondaryButton label={changeAnswers} onPress={() => go('answers')} />
        <QuietButton label="Keep tracking as usual" color={GM.textMuted} onPress={onCancel} style={{ alignSelf: 'center' }} />
      </View>
    );
  }

  if (step === 'review' && proposal) {
    return (
      <View style={styles.stack}>
        <PreviewBanner unreviewed={proposal.isPreviewOnly} />
        <TargetsReview proposal={proposal} person={person} />
        {view.canAdjustTargets && (
          <GText variant="small" tone="secondary">
            These are the recommended starting numbers. You can fine-tune them once Guidance is on.
          </GText>
        )}
        <PrimaryButton full label={pending ? 'Turning on…' : 'Turn on Guidance'} disabled={pending} onPress={confirmTargets} style={styles.big} />
        <SecondaryButton label={changeAnswers} disabled={pending} onPress={() => go('answers')} />
        <ErrorLine error={error} />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <PreviewBanner unreviewed={view.isPreviewOnly} />
      <Notice>
        <GText variant="small" tone="secondary">
          {person.isSelf
            ? view.hasEverActivated
              ? 'Guidance is off. Answer a few health questions to turn it back on.'
              : "Answer a few health questions to get daily calorie, protein, carb, fat and fiber targets. You'll see them before anything is switched on."
            : view.hasEverActivated
              ? `Guidance is off for ${person.name}. Answer a few health questions to turn it back on.`
              : `Answer a few health questions for ${person.name} to get their daily targets. You'll see them before anything is switched on, and it's recorded as set up by you.`}
        </GText>
      </Notice>
      <GuidanceSetupForm
        person={person}
        value={form}
        onChange={(next) => {
          setForm(next);
          if (problem) setProblem(null);
        }}
        editingDetails={editingDetails}
        onEditingDetails={setEditingDetails}
        highlight={problem?.field ?? null}
      />
      <PrimaryButton
        full
        label={pending ? 'Calculating…' : person.isSelf ? 'See my targets' : 'See the targets'}
        disabled={pending}
        onPress={submitAnswers}
        style={styles.big}
      />
      <ErrorLine error={problem?.message ?? error} />
    </View>
  );
}

/** The setup screen's body for a view already loaded. Used by the route
 * (with real requests) and by the dev preview (with stand-ins). */
export function GuidanceSetupPanel({
  view,
  post,
  onDone,
  scrollToTop = () => {},
}: {
  view: GuidanceView | null;
  post: Post;
  /** Back to the person's screen, which reloads. */
  onDone: () => void;
  scrollToTop?: () => void;
}) {
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function returnToTracking() {
    setError(null);
    setStopping(true);
    post('off')
      .then((r) => (r.ok ? onDone() : setError(r.message || GENERIC_ERROR)))
      .catch(() => setError(GENERIC_ERROR))
      .finally(() => setStopping(false));
  }

  if (!view || view.kind === 'not_found' || view.kind === 'feature_off') {
    return (
      <Notice title="Not available">
        <GText variant="small" tone="secondary">
          Nutrition Guidance isn&apos;t available for this person.
        </GText>
      </Notice>
    );
  }

  switch (view.kind) {
    case 'setup':
      return <SetupFlow view={view} post={post} onActivated={onDone} onCancel={onDone} scrollToTop={scrollToTop} />;
    case 'active':
      return (
        <View style={styles.stack}>
          <PreviewBanner unreviewed={view.isPreviewOnly} />
          <Notice title="Guidance is on">
            <GText variant="small" tone="secondary">
              {view.person.isSelf ? 'Your' : `${view.person.name}'s`} daily targets, meal suggestions and weekly progress are on the profile
              screen.
            </GText>
          </Notice>
          <SecondaryButton label="Back" onPress={onDone} />
        </View>
      );
    case 'paused':
      return (
        <View style={styles.stack}>
          <Notice title="Guidance is paused">
            <GText variant="small" tone="secondary">
              {view.message}
            </GText>
          </Notice>
          {view.canReturnToTracking && (
            <Card style={{ gap: 12 }}>
              <GText variant="small" tone="secondary">
                You can switch fully back to Tracking. Your meals and history stay as they are.
              </GText>
              <SecondaryButton label={stopping ? 'Switching…' : 'Return to Tracking'} disabled={stopping} onPress={returnToTracking} />
              <ErrorLine error={error} />
            </Card>
          )}
        </View>
      );
    case 'unavailable':
      return (
        <Notice title="Not available yet">
          <GText variant="small" tone="secondary">
            {view.message}
          </GText>
        </Notice>
      );
  }
}

/** The page frame: charcoal, scrolling, keyboard-aware. */
export function GuidanceSetupFrame({ children, scrollRef }: { children: ReactNode; scrollRef?: RefObject<ScrollView | null> }) {
  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, backgroundColor: GM.page }}
      contentContainerStyle={styles.frame}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
      indicatorStyle="white"
    >
      <GText variant="h1" accessibilityRole="header" style={{ marginBottom: 14 }}>
        Nutrition Guidance
      </GText>
      {children}
    </ScrollView>
  );
}

/** The route's screen: loads the view for this person, then the panel. */
export function GuidanceSetupScreen({ subject }: { subject: GuidanceSubject }) {
  const scrollRef = useRef<ScrollView>(null);
  const { data, refresh, failed } = useGuidanceData(subject);
  const done = () => (router.canGoBack() ? router.back() : router.replace(subject.kind === 'gym' ? '/gym' : '/adults'));

  return (
    <GuidanceSetupFrame scrollRef={scrollRef}>
      {data === undefined ? (
        failed ? (
          <Notice title="Couldn't load Guidance">
            <GText variant="small" tone="secondary">
              Check the connection and try again.
            </GText>
            <SecondaryButton label="Try again" onPress={refresh} />
          </Notice>
        ) : (
          <View style={{ paddingVertical: 48 }}>
            <ActivityIndicator color={GM.accent} accessibilityLabel="Loading" />
          </View>
        )
      ) : (
        <GuidanceSetupPanel
          view={data?.view ?? null}
          post={(op, body) => api.guidanceAction(subject, op, body)}
          onDone={done}
          scrollToTop={() => scrollRef.current?.scrollTo({ y: 0, animated: false })}
        />
      )}
    </GuidanceSetupFrame>
  );
}

const styles = StyleSheet.create({
  frame: { padding: 16, paddingBottom: 48 },
  stack: { gap: 14 },
  big: { minHeight: GM_TAP + 6 },
  tileCalories: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GM.accentBorder,
    backgroundColor: GM.accentSoft,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GM.border,
    backgroundColor: GM.raised,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  disclosure: { minHeight: GM_TAP, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
