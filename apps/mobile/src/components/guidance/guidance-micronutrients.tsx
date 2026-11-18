import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GM } from '@/constants/guidance-theme';
import { microAmountText, microHeadline, microTrendText, rangeText, STATUS_TEXT, type GuidanceViewer } from '@/lib/guidance-format';
import type {
  AssessmentStatus,
  MicroKey,
  MicronutrientAssessment,
  MicronutrientPanel,
  NextStep,
  PeriodKind,
  SupplementView,
} from '@/lib/guidance-types';

import { Card, ChoiceChips, Chevron, ErrorLine, GText, PrimaryButton, QuietButton, SelectField, TextField, styles as ui } from './ui';
import { useGuidanceAction, type GuidanceActions } from './use-guidance';

// Vitamins and minerals on the Progress tab: the one or two concerns worth
// acting on, each with its evidence and one next step, and the full list
// behind "All vitamins & minerals". Mirrors the web's
// GuidanceMicronutrients.tsx. Every figure is an estimate from logged meals
// against a pinned reference edition; unknown stays "Unknown", never 0 and
// never an empty bar. No status here is a diagnosis.

/** The vitamins and minerals a supplement can carry, as the web's
 * nutrients catalog (src/lib/nutrients/catalog.ts) names and measures them. */
const MICROS: Array<{ key: MicroKey; label: string; unit: 'mg' | 'µg' }> = [
  { key: 'calcium', label: 'Calcium', unit: 'mg' },
  { key: 'iron', label: 'Iron', unit: 'mg' },
  { key: 'magnesium', label: 'Magnesium', unit: 'mg' },
  { key: 'potassium', label: 'Potassium', unit: 'mg' },
  { key: 'zinc', label: 'Zinc', unit: 'mg' },
  { key: 'folate', label: 'Folate', unit: 'µg' },
  { key: 'vitamin_a', label: 'Vitamin A', unit: 'µg' },
  { key: 'vitamin_b12', label: 'Vitamin B12', unit: 'µg' },
  { key: 'vitamin_c', label: 'Vitamin C', unit: 'mg' },
  { key: 'vitamin_d', label: 'Vitamin D', unit: 'µg' },
  { key: 'iodine', label: 'Iodine', unit: 'µg' },
];
const UNIT_CHOICES: Record<string, string[]> = { mg: ['mg', 'µg'], µg: ['µg', 'mg', 'IU'] };
const unitChoices = (key: MicroKey) => {
  const unit = MICROS.find((m) => m.key === key)?.unit ?? 'mg';
  return key === 'vitamin_d' ? ['µg', 'IU'] : (UNIT_CHOICES[unit] ?? [unit]);
};

function StatusChip({ status }: { status: AssessmentStatus }) {
  const tone =
    status === 'above_upper_limit'
      ? { borderColor: GM.overBorder, backgroundColor: GM.overSoft, color: GM.overText }
      : status === 'within_range'
        ? { borderColor: GM.accentBorder, backgroundColor: 'transparent', color: GM.accentText }
        : { borderColor: GM.borderStrong, backgroundColor: 'transparent', color: GM.textSecondary };
  return (
    <View style={[styles.chip, { borderColor: tone.borderColor, backgroundColor: tone.backgroundColor }]}>
      <Text style={[styles.chipText, { color: tone.color }]}>{STATUS_TEXT[status]}</Text>
    </View>
  );
}

function ClarifyStep({ step, actions }: { step: Extract<NextStep, { kind: 'clarify' }>; actions?: GuidanceActions }) {
  const { run, pending, error } = useGuidanceAction();
  const [brand, setBrand] = useState('');
  if (!actions) return <GText variant="body">{step.question}</GText>;
  const key = step.key;
  return (
    <View>
      <GText variant="body">{step.question}</GText>
      {key === 'product_brand' ? (
        <View style={[styles.wrapRow, { marginTop: 10 }]}>
          <TextField
            label={`Brand of ${step.itemName ?? 'this product'}`}
            hideLabel
            value={brand}
            onChangeText={setBrand}
            placeholder="Brand name"
            returnKeyType="done"
            style={{ flex: 1, minWidth: 160 }}
          />
          <PrimaryButton
            label="Save"
            accessibilityLabel="Save the brand"
            disabled={pending || !brand.trim()}
            onPress={() => run(() => actions.answerClarification({ key: 'product_brand', itemName: step.itemName ?? '', brand: brand.trim() }))}
          />
        </View>
      ) : (
        <View style={[styles.wrapRow, { marginTop: 10 }]}>
          {(['yes', 'no', 'unsure'] as const).map((answer) => {
            const label = answer === 'yes' ? 'Yes' : answer === 'no' ? 'No' : 'Not sure';
            return (
              <QuietButton
                key={answer}
                label={label}
                accessibilityLabel={`${label}: ${step.question}`}
                color={GM.text}
                disabled={pending}
                onPress={() => run(() => actions.answerClarification({ key, answer }))}
                style={styles.answer}
              />
            );
          })}
        </View>
      )}
      <ErrorLine error={error} />
    </View>
  );
}

function StepView({ step, actions }: { step: NextStep; actions?: GuidanceActions }) {
  switch (step.kind) {
    case 'clarify':
      return <ClarifyStep step={step} actions={actions} />;
    case 'food':
      return (
        <View>
          <GText variant="body">{step.text}</GText>
          {step.foods.length > 0 && (
            <View style={[styles.wrapRow, { marginTop: 8 }]}>
              {step.foods.map((f) => (
                <View key={f.key} style={styles.foodPill}>
                  <GText variant="small" tone="secondary">
                    {f.label}
                    {f.portion ? ` · ${f.portion}` : ''}
                  </GText>
                </View>
              ))}
            </View>
          )}
        </View>
      );
    case 'log':
    case 'profile':
      return <GText variant="body">{step.text}</GText>;
    case 'none':
      return null;
  }
}

function Concern({ a, actions }: { a: MicronutrientAssessment; actions?: GuidanceActions }) {
  const [why, setWhy] = useState(false);
  return (
    <View style={ui.divider}>
      <View style={styles.titleRow}>
        <GText variant="h3">{a.label}</GText>
        <StatusChip status={a.status} />
      </View>
      <GText variant="body" tone="secondary" style={{ marginTop: 4 }}>
        {a.observation}
      </GText>
      <GText variant="caption" tone="muted" style={{ marginTop: 4 }}>
        {a.days.documented} of {a.days.total} days documented · {rangeText(a.period.start, a.period.end)}
      </GText>
      <View style={{ marginTop: 10 }}>
        <StepView step={a.nextStep} actions={actions} />
      </View>
      <QuietButton
        label={why ? 'Hide the explanation' : 'Why this?'}
        accessibilityLabel={why ? `Hide the explanation for ${a.label}` : `Why this? ${a.label}`}
        expanded={why}
        onPress={() => setWhy((w) => !w)}
      />
      {why && (
        <GText variant="small" tone="secondary">
          {a.explanation}
        </GText>
      )}
    </View>
  );
}

/** Supplements: what someone takes, and today's dose marked as taken. A
 * supplement on the list is never counted; only a dose marked taken is, and
 * it's shown apart from food. */
function Supplements({ supplements, actions }: { supplements: SupplementView[]; actions?: GuidanceActions }) {
  const { run, pending, error } = useGuidanceAction();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [rows, setRows] = useState<Array<{ key: MicroKey; amount: string; unit: string }>>([{ key: 'vitamin_d', amount: '', unit: 'µg' }]);
  if (!actions && supplements.length === 0) return null;

  const reset = () => {
    setAdding(false);
    setName('');
    setBrand('');
    setRows([{ key: 'vitamin_d', amount: '', unit: 'µg' }]);
  };

  return (
    <View style={[ui.divider, { marginTop: 20 }]}>
      <GText variant="h3">Supplements</GText>
      <GText variant="caption" tone="muted" style={{ marginTop: 2 }}>
        Only a dose marked as taken counts, and it&apos;s kept apart from food.
      </GText>
      {supplements.length > 0 && (
        <View style={{ marginTop: 12, gap: 8 }}>
          {supplements.map((s) => (
            <View key={s.id} style={styles.raised}>
              <GText variant="small" style={{ fontWeight: '600' }}>
                {s.name}
                {s.brand ? <GText variant="small" tone="secondary">{` · ${s.brand}`}</GText> : null}
              </GText>
              <GText variant="caption" tone="secondary">
                {s.perDose.map((n) => `${n.label} ${n.amount} ${n.unit}`).join(', ')} a dose
              </GText>
              {actions && (
                <View style={[styles.wrapRow, { marginTop: 8 }]}>
                  {s.takenToday ? (
                    <QuietButton
                      label="Taken today · undo"
                      accessibilityLabel={`${s.name} taken today. Undo`}
                      pressed
                      disabled={pending}
                      onPress={() => run(() => actions.setSupplementTaken({ scheduleId: s.id, taken: false }))}
                    />
                  ) : (
                    <PrimaryButton
                      label="Taken today"
                      accessibilityLabel={`Mark ${s.name} as taken today`}
                      disabled={pending}
                      onPress={() => run(() => actions.setSupplementTaken({ scheduleId: s.id, taken: true }))}
                    />
                  )}
                  <QuietButton
                    label="Stop"
                    accessibilityLabel={`Stop ${s.name}`}
                    disabled={pending}
                    onPress={() => run(() => actions.stopSupplement(s.id))}
                  />
                </View>
              )}
            </View>
          ))}
        </View>
      )}
      {actions && !adding && <QuietButton label="+ Add a supplement" onPress={() => setAdding(true)} style={{ marginTop: 4 }} />}
      {actions && adding && (
        <View style={[styles.form, { marginTop: 12 }]}>
          <GText variant="small" tone="secondary">
            Copy the amounts per dose from the label.
          </GText>
          <TextField label="Name" value={name} onChangeText={setName} placeholder="Name, e.g. Vitamin D3" />
          <TextField label="Brand (optional)" value={brand} onChangeText={setBrand} placeholder="Brand (optional)" />
          {rows.map((r, i) => (
            <View key={i} style={{ gap: 8 }}>
              <SelectField
                label="Vitamin or mineral"
                options={MICROS.map((m) => ({ value: m.key, label: m.label }))}
                value={r.key}
                onChange={(key) => setRows((all) => all.map((x, j) => (j === i ? { ...x, key, unit: unitChoices(key)[0] } : x)))}
              />
              <View style={[styles.wrapRow, { alignItems: 'flex-end' }]}>
                <TextField
                  label="Amount per dose"
                  value={r.amount}
                  keyboardType="decimal-pad"
                  placeholder="Amount"
                  onChangeText={(amount) => setRows((all) => all.map((x, j) => (j === i ? { ...x, amount } : x)))}
                  style={{ width: 130 }}
                />
                <ChoiceChips
                  label="Unit"
                  hideLabel
                  options={unitChoices(r.key).map((u) => ({ value: u, label: u }))}
                  value={r.unit}
                  onChange={(unit) => setRows((all) => all.map((x, j) => (j === i ? { ...x, unit } : x)))}
                />
              </View>
            </View>
          ))}
          {rows.length < 8 && (
            <QuietButton
              label="+ Another vitamin or mineral"
              onPress={() => setRows((all) => [...all, { key: 'calcium', amount: '', unit: 'mg' }])}
            />
          )}
          <View style={styles.wrapRow}>
            <PrimaryButton
              label="Save supplement"
              disabled={pending || !name.trim()}
              onPress={() =>
                run(
                  () =>
                    actions.addSupplement({
                      name,
                      brand,
                      nutrients: rows.filter((x) => x.amount.trim()).map((x) => ({ key: x.key, amount: Number(x.amount), unit: x.unit })),
                    }),
                  reset
                )
              }
            />
            <QuietButton label="Cancel" onPress={() => setAdding(false)} />
          </View>
        </View>
      )}
      <ErrorLine error={error} />
    </View>
  );
}

/** "All vitamins & minerals": a list on a phone, as the web shows below md. */
function AllList({ assessments, kind }: { assessments: MicronutrientAssessment[]; kind: PeriodKind }) {
  const last = kind === 'week' ? 'last week' : 'last month';
  const sources = (a: MicronutrientAssessment) =>
    a.mainSources.length === 0 ? 'None recorded' : a.mainSources.slice(0, 3).map((s) => s.label).join(', ');
  return (
    <View style={{ marginTop: 12, gap: 10 }}>
      {assessments.map((a) => {
        const rows: Array<[string, string]> = [
          ['Food, a day', microAmountText(a.food.average, a.unit, a.food.isFloor)],
          ['Supplements', a.supplements.average ? microAmountText(a.supplements.average, a.unit) : 'None confirmed'],
          ['Reference', a.reference ? `${a.reference.kind} ${microAmountText(a.reference.amount, a.reference.unit)}` : 'No reference'],
          ...(a.upperLimit ? [['Upper limit', `UL ${microAmountText(a.upperLimit.amount, a.upperLimit.unit)}`] as [string, string]] : []),
          [`vs ${last}`, microTrendText(a)],
          ['Documented', `${a.days.documented} of ${a.days.total} days`],
          ['Main sources', sources(a)],
        ];
        return (
          <View key={a.nutrient} style={styles.raised}>
            <View style={styles.titleRow}>
              <GText variant="body" style={{ fontWeight: '700' }}>
                {a.label}
              </GText>
              <StatusChip status={a.status} />
            </View>
            <View style={{ marginTop: 8, gap: 4 }}>
              {rows.map(([term, detail]) => (
                <View key={term} style={styles.defRow} accessible accessibilityLabel={`${term}: ${detail}`}>
                  <GText variant="small" tone="muted" style={{ flex: 1 }}>
                    {term}
                  </GText>
                  <GText variant="small" tone={term === 'Food, a day' ? 'primary' : 'secondary'} style={[ui.tabular, { flex: 1.3 }]}>
                    {detail}
                  </GText>
                </View>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function MicronutrientCard({
  panel,
  periodKind,
  viewer,
  actions,
}: {
  panel: MicronutrientPanel;
  periodKind: PeriodKind;
  viewer: GuidanceViewer;
  actions?: GuidanceActions;
}) {
  const [all, setAll] = useState(false);
  const period = panel.periods[periodKind];
  const concerns = period.concerns;
  const { headline, documented } = microHeadline(period);
  const clarification = panel.clarification;

  return (
    <Card accessibilityLabel="Vitamins and minerals">
      <GText variant="eyebrow" tone="secondary">
        Vitamins &amp; minerals
      </GText>
      <GText variant="h2" accessibilityRole="header" style={{ marginTop: 8 }}>
        {headline}
      </GText>
      <GText variant="small" tone="secondary" style={{ marginTop: 4 }}>
        From {viewer.kind === 'self' ? 'your' : `${viewer.name}'s`} logged meals, {rangeText(period.start, period.end)}. Estimates, not a
        diagnosis.
      </GText>

      {concerns.length > 0 ? (
        <View>
          {concerns.map((a) => (
            <Concern key={a.nutrient} a={a} actions={actions} />
          ))}
        </View>
      ) : (
        period.assessments.length > 0 && (
          <GText variant="body" style={{ marginTop: 14 }}>
            {documented < 3
              ? "Vitamins and minerals need at least 3 fully logged days, with the foods identified, before they're compared with a reference."
              : "No nutrient has a clear gap or an excess on the documented days. That's what the logged meals show, not a measure of what the body has."}
          </GText>
        )
      )}

      {clarification && !concerns.some((c) => c.nextStep.kind === 'clarify' && c.nextStep.key === clarification.key) && (
        <View style={[ui.divider, { marginTop: 20 }]}>
          <GText variant="eyebrow" tone="secondary">
            One question that would sharpen this
          </GText>
          <View style={{ marginTop: 8 }}>
            <ClarifyStep step={clarification} actions={actions} />
          </View>
        </View>
      )}

      {period.assessments.length > 0 && (
        <>
          <QuietButton
            label="All vitamins & minerals"
            expanded={all}
            onPress={() => setAll((o) => !o)}
            style={{ marginTop: 12 }}
            trailing={<Chevron direction={all ? 'up' : 'down'} color={GM.accentText} size={18} />}
          />
          {all && <AllList assessments={period.assessments} kind={periodKind} />}
        </>
      )}

      <Supplements supplements={panel.supplements} actions={actions} />

      {panel.edition && (
        <GText variant="caption" tone="muted" style={{ marginTop: 18 }}>
          Reference: {panel.edition.name}
          {panel.edition.reviewStatus !== 'reviewed' ? ', not yet reviewed for this product by a health professional' : ''}. Food values:{' '}
          {panel.datasets.join(', ')}. Iodine stays unknown unless a product label says otherwise; salt can&apos;t be seen in a photo.
        </GText>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  chipText: { fontSize: 12, fontWeight: '600' },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  answer: { borderWidth: 1, borderColor: GM.borderStrong, borderRadius: 12, paddingHorizontal: 16 },
  foodPill: { backgroundColor: GM.raised, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  raised: { backgroundColor: GM.raised, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12 },
  defRow: { flexDirection: 'row', gap: 12 },
  form: { borderWidth: 1, borderColor: GM.border, borderRadius: 14, padding: 16, gap: 12 },
});
