import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Linking, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GM, GM_TAP } from '@/constants/guidance-theme';
import { summarizeDays } from '@/lib/guidance-aggregation';
import type { GuidanceViewer } from '@/lib/guidance-format';
import type { GuidanceDashboard } from '@/lib/guidance-types';

import { GuidanceProgressTab } from './guidance-progress-tab';
import { GuidanceTodayTab } from './guidance-today-tab';
import { GText, Note, PrimaryButton, Segmented } from './ui';
import type { GuidanceActions } from './use-guidance';

// Guidance mode's whole screen: the beta note, Today and Progress tabs, and
// (for someone looking at their own profile) a Log a meal bar. Mirrors the
// web's GuidanceScreen.tsx. It replaces the long tracking dashboard rather
// than sitting inside it; the screen's own `header` (the Guidance mode
// switch) stays at the top.

type Tab = 'today' | 'progress';

export function GuidanceScreen({
  guidance,
  viewer,
  firstName,
  actions,
  header,
  notice,
  onRefresh,
}: {
  guidance: GuidanceDashboard;
  viewer: GuidanceViewer;
  /** The tracked person's first name, for "Good morning, Kamlesh". */
  firstName: string;
  /** Absent for a read-only view: the cards show, the buttons don't. */
  actions?: GuidanceActions;
  /** Above everything: the Guidance mode switch. */
  header?: ReactNode;
  /** Shown above the tabs' content, e.g. the WhatsApp invite. */
  notice?: ReactNode;
  /** Pull to refresh. Its spinner shows for a pull, not for the quiet
   * refetch after every action. */
  onRefresh?: () => Promise<void> | void;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('today');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [scrollToDetails, setScrollToDetails] = useState(false);
  const [pulling, setPulling] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const detailsRef = useRef<View>(null);
  const summaries = useMemo(
    () => summarizeDays(guidance.history, guidance.date, guidance.expectedMealsPerDay, guidance.skips),
    [guidance.history, guidance.date, guidance.expectedMealsPerDay, guidance.skips]
  );
  const canLog = viewer.kind === 'self' && !!guidance.logMealHref;

  function showHistory() {
    setTab('progress');
    setDetailsOpen(true);
    setScrollToDetails(true);
  }

  // Once the Progress tab has laid out with the history open, bring it into view.
  useEffect(() => {
    if (!scrollToDetails || tab !== 'progress') return;
    const frame = requestAnimationFrame(() => {
      const details = detailsRef.current;
      const content = contentRef.current;
      if (details && content) {
        details.measureLayout(
          content,
          (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }),
          () => {}
        );
      }
      setScrollToDetails(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollToDetails, tab]);

  function changeTab(next: Tab) {
    setTab(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }

  return (
    <View style={styles.page}>
      <ScrollView
        ref={scrollRef}
        style={styles.page}
        contentContainerStyle={[styles.content, { paddingBottom: canLog && tab === 'today' ? 120 : 48 }]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        indicatorStyle="white"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={pulling}
              onRefresh={() => {
                setPulling(true);
                Promise.resolve(onRefresh()).finally(() => setPulling(false));
              }}
              tintColor={GM.accent}
              colors={[GM.accent]}
              progressBackgroundColor={GM.card}
            />
          ) : undefined
        }
      >
        <View ref={contentRef} collapsable={false}>
          {header}
          {/* Always shown: Guidance mode is a beta, whatever the environment. */}
          <Note style={{ marginTop: header ? 14 : 0 }}>
            <GText variant="small" tone="over">
              <GText variant="small" tone="over" bold>
                Beta.
              </GText>{' '}
              Guidance mode is new and still being tested
              {guidance.isPreviewOnly ? ", and its targets haven't been checked by a health professional yet" : ''}. Estimates come from meal
              photos.
            </GText>
          </Note>
          {notice ? <View style={{ marginTop: 14 }}>{notice}</View> : null}

          <Segmented
            role="tab"
            label={`${viewer.kind === 'self' ? 'Your' : `${viewer.name}'s`} nutrition`}
            value={tab}
            onChange={changeTab}
            options={[
              { value: 'today', label: 'Today' },
              { value: 'progress', label: 'Progress' },
            ]}
            style={{ marginTop: 16, marginBottom: 20 }}
          />

          {tab === 'today' ? (
            <GuidanceTodayTab guidance={guidance} viewer={viewer} firstName={firstName} onShowHistory={showHistory} actions={actions} />
          ) : (
            <GuidanceProgressTab
              guidance={guidance}
              viewer={viewer}
              summaries={summaries}
              detailsOpen={detailsOpen}
              onDetailsToggle={setDetailsOpen}
              actions={actions}
              detailsRef={detailsRef}
            />
          )}
        </View>
      </ScrollView>

      {/* On a phone, logging is the one always-reachable action. */}
      {canLog && tab === 'today' && (
        <View style={[styles.logBar, { paddingBottom: Math.max(16, insets.bottom) }]}>
          <PrimaryButton
            full
            label="+ Log a meal"
            accessibilityLabel="Log a meal: opens Tistra on WhatsApp"
            onPress={() => Linking.openURL(guidance.logMealHref!).catch(() => {})}
            style={{ minHeight: GM_TAP + 6 }}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: GM.page },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  logBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: GM.page,
    borderTopWidth: 1,
    borderTopColor: GM.border,
  },
});
