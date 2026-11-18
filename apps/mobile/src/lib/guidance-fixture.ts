// SAMPLE data for the dev-only Guidance preview (app/guidance-preview.tsx).
// Nothing here is a real person or a real reading: Kamlesh is the name the
// design mockups use. The numbers are built to exercise every state the
// screens draw: complete, partial and unlogged days, today in progress, a
// week-on-week change, a planned meal, a chosen habit, vitamin and mineral
// concerns with a clarifying question, and a supplement.
//
// The dates are fixed (today is Saturday 14 November 2026, lunchtime in
// Kolkata), so the preview looks the same every time it's opened.

import type {
  DailyTotals,
  GuidanceDashboard,
  GuidanceDay,
  GuidanceMealRow,
  GuidanceResponse,
  HabitOption,
  MealSuggestion,
  MicronutrientAssessment,
  MicronutrientPanel,
  NutrientDay,
  NutrientKey,
  ProposalResult,
} from './guidance-types';

export type GuidancePreviewScenario = 'self' | 'family' | 'coach' | 'setup' | 'paused' | 'off';

const TODAY = '2026-11-14';
const TIMEZONE = 'Asia/Kolkata';
const TARGET = { caloriesKcal: 1436, proteinG: 95, carbsG: 160, fatG: 48, fiberG: 28 };

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function nutrientDay(consumed: number, target: number, missing = 0): NutrientDay {
  return {
    target,
    consumed: Math.round(consumed),
    remaining: Math.max(0, target - Math.round(consumed)),
    over: Math.max(0, Math.round(consumed) - target),
    isIncomplete: missing > 0,
    mealsMissingData: missing,
  };
}

/** One day as [meals logged, protein g, energy kcal, fibre g]; fibre null
 * means one meal had no fibre estimate. */
type DaySpec = [number, number, number, number | null];

const DAYS: Record<string, DaySpec> = {
  // October, for the month comparison.
  '2026-10-26': [3, 50, 1390, 22],
  '2026-10-27': [3, 47, 1310, 20],
  '2026-10-28': [2, 30, 900, 12],
  '2026-10-29': [3, 52, 1420, 24],
  '2026-10-30': [0, 0, 0, 0],
  '2026-10-31': [3, 49, 1350, 21],
  // Last week.
  '2026-11-01': [3, 51, 1380, 23],
  '2026-11-02': [3, 48, 1330, 21],
  '2026-11-03': [3, 52, 1400, 22],
  '2026-11-04': [2, 35, 980, 14],
  '2026-11-05': [3, 50, 1360, 23],
  '2026-11-06': [3, 55, 1450, 25],
  '2026-11-07': [0, 0, 0, 0],
  '2026-11-08': [3, 51, 1370, 22],
  // This week: Wednesday not logged, Friday partial, today in progress.
  '2026-11-09': [3, 62, 1420, 24],
  '2026-11-10': [3, 66, 1480, 26],
  '2026-11-11': [0, 0, 0, 0],
  '2026-11-12': [3, 70, 1510, null],
  '2026-11-13': [2, 44, 1020, 15],
  '2026-11-14': [1, 30, 789, 4],
};

const SLOT_TIMES: Array<[string, string]> = [
  ['breakfast', '02:40'], // 8:10 am in Kolkata
  ['lunch', '07:50'], // 1:20 pm
  ['dinner', '14:45'], // 8:15 pm
];

const MENUS: Record<string, Array<{ name: string; quantity: string | null }>> = {
  breakfast: [
    { name: 'paratha', quantity: '2 pieces' },
    { name: 'egg bhurji', quantity: '2 eggs' },
    { name: 'milk', quantity: '1 glass' },
  ],
  lunch: [
    { name: 'dal', quantity: '1 bowl' },
    { name: 'rice', quantity: '1 cup' },
    { name: 'bhindi sabzi', quantity: null },
  ],
  dinner: [
    { name: 'roti', quantity: '2' },
    { name: 'chicken curry', quantity: '1 bowl' },
    { name: 'salad', quantity: null },
  ],
};

function mealsFor(date: string, [count, protein, kcal, fibre]: DaySpec): GuidanceMealRow[] {
  return SLOT_TIMES.slice(0, count).map(([slot, time], i) => {
    const p = protein / count;
    const k = kcal / count;
    const noFibre = fibre == null && i === count - 1;
    const f = fibre == null ? 20 / count : fibre / count;
    return {
      id: `${date}-${slot}`,
      loggedAt: `${date}T${time}:00Z`,
      mealType: slot,
      foods: MENUS[slot],
      totalCaloriesMin: Math.round(k * 0.9),
      totalCaloriesMax: Math.round(k * 1.1),
      totalProteinMin: Math.round(p) - 2,
      totalProteinMax: Math.round(p) + 2,
      totalCarbsMin: Math.round(k * 0.11),
      totalCarbsMax: Math.round(k * 0.13),
      totalFatMin: Math.round(k * 0.03),
      totalFatMax: Math.round(k * 0.04),
      totalFiberMin: noFibre ? null : Math.round(f),
      totalFiberMax: noFibre ? null : Math.round(f),
    };
  });
}

function totalsFor(date: string, [count, protein, kcal, fibre]: DaySpec): DailyTotals {
  const missingFibre = fibre == null ? 1 : 0;
  const fibreKnown = fibre == null ? (20 / count) * (count - 1) : fibre;
  const t: Record<NutrientKey, NutrientDay> = {
    calories: nutrientDay(kcal, TARGET.caloriesKcal),
    protein: nutrientDay(protein, TARGET.proteinG),
    carbs: nutrientDay(kcal * 0.12, TARGET.carbsG),
    fat: nutrientDay(kcal * 0.035, TARGET.fatG),
    fiber: nutrientDay(fibreKnown, TARGET.fiberG, missingFibre),
  };
  return { date, mealCount: count, ...t, hasIncompleteData: missingFibre > 0 };
}

const suggestion = (over: Partial<MealSuggestion> & Pick<MealSuggestion, 'id' | 'title'>): MealSuggestion => ({
  version: 'suggest-2026-11-v1',
  date: TODAY,
  slot: 'lunch',
  headline: 'Make room for protein',
  reason: 'A simple lunch to build on breakfast.',
  components: [],
  estimate: { calories: 520, protein: 41, carbs: 52, fat: 14, fiber: 9 },
  familiar: true,
  brings: null,
  ...over,
});

const source = (foodId: string, description: string) => ({ foodId, description, dataset: 'USDA FoodData Central', version: '2024-10' });

const SUGGESTIONS: MealSuggestion[] = [
  suggestion({
    id: 'sample-chicken-dal',
    title: 'Chicken, dal & vegetables',
    components: [
      { id: 'chicken', food: 'chicken', portion: '100 g cooked chicken', grams: 100, role: 'protein', source: source('171477', 'Chicken breast, cooked') },
      { id: 'dal', food: 'dal', portion: '½ cup dal', grams: 99, role: 'dal', source: source('172421', 'Lentils, boiled') },
      { id: 'rice', food: 'rice', portion: '½ cup cooked rice', grams: 79, role: 'base', source: source('169757', 'Rice, white, cooked') },
      { id: 'veg', food: 'vegetables', portion: '1 cup vegetables', grams: 91, role: 'veg', source: source('170393', 'Mixed vegetables, cooked') },
    ],
    brings: { nutrient: 'iron', label: 'Iron', amount: 3.1, unit: 'mg' },
  }),
  suggestion({
    id: 'sample-paneer-roti',
    title: 'Paneer, roti & salad',
    headline: 'A vegetarian way to the protein',
    components: [
      { id: 'paneer', food: 'paneer', portion: '75 g paneer', grams: 75, role: 'protein', source: source('173418', 'Cheese, paneer') },
      { id: 'roti', food: 'roti', portion: '2 rotis', grams: 80, role: 'base', source: source('168895', 'Bread, whole wheat') },
      { id: 'salad', food: 'salad', portion: '1 cup salad', grams: 100, role: 'veg', source: source('169249', 'Cucumber and tomato') },
    ],
    estimate: { calories: 560, protein: 29, carbs: 48, fat: 26, fiber: null },
  }),
];

const HABITS: HabitOption[] = [
  {
    key: 'protein_breakfast',
    title: 'Build protein into breakfast',
    shortTitle: 'Protein at breakfast',
    reason: 'Spreading protein across the day is easier than catching up at dinner.',
    change: { standard: 'Next time you have egg bhurji, try adding one extra egg.', easier: 'Add one boiled egg to breakfast on 3 days this week.' },
    evidence: { observation: '9 of 12 logged breakfasts had under 15 g of protein.', looked: 12, low: 9, from: '2026-10-26', to: '2026-11-08' },
  },
  {
    key: 'fibre_lunch',
    title: 'Add vegetables or dal to lunch',
    shortTitle: 'Fibre at lunch',
    reason: 'Vegetables, dal and whole grains bring fibre, and fill you up for longer.',
    change: { standard: 'Add a bowl of dal or a cup of vegetables to lunch.', easier: 'Add a side of vegetables to lunch on 3 days this week.' },
    evidence: { observation: '7 of 11 logged lunches had under 6 g of fibre.', looked: 11, low: 7, from: '2026-10-26', to: '2026-11-08' },
  },
];

const assessment = (over: Partial<MicronutrientAssessment> & Pick<MicronutrientAssessment, 'nutrient' | 'label' | 'unit' | 'status'>, start: string): MicronutrientAssessment => ({
  period: { start, end: TODAY },
  days: { documented: 3, total: 5 },
  food: { average: null, isFloor: false },
  supplements: { average: null, unconfirmedScheduledDoses: 0 },
  total: null,
  reference: null,
  upperLimit: null,
  percentOfReference: null,
  trend: { kind: 'insufficient', currentDays: 3, previousDays: 2, required: 3 },
  mainSources: [],
  observation: '',
  nextStep: { kind: 'none' },
  explanation: '',
  evidence: 0,
  ...over,
});

const ref = (kind: 'RDA' | 'AI', amount: number, unit: string) => ({
  kind,
  amount,
  unit,
  edition: 'icmr-nin-2020',
  editionVersion: '2020',
  lifeStage: 'men 50–69',
});

function micronutrients(): MicronutrientPanel {
  const period = (start: string) => {
    const assessments = [
      assessment(
        {
          nutrient: 'vitamin_d',
          label: 'Vitamin D',
          unit: 'µg',
          status: 'no_reliable_source',
          food: { average: 0.4, isFloor: true },
          reference: ref('RDA', 15, 'µg'),
          observation: 'None of the documented meals had a meaningful source of vitamin D.',
          nextStep: { kind: 'clarify', key: 'milk_fortified', question: 'Is the milk usually drunk at home fortified with vitamin D?' },
          explanation: 'Few foods carry vitamin D unless they are fortified, and a photo cannot show whether milk is.',
          mainSources: [{ key: 'milk', label: 'milk', share: 1 }],
        },
        start
      ),
      assessment(
        {
          nutrient: 'calcium',
          label: 'Calcium',
          unit: 'mg',
          status: 'below_reference',
          food: { average: 612, isFloor: false },
          total: 612,
          reference: ref('RDA', 1000, 'mg'),
          upperLimit: { ...ref('RDA', 2500, 'mg'), kind: 'UL', appliesTo: 'total' },
          percentOfReference: 61,
          observation: 'On documented days, calcium averaged about 610 mg, under the 1,000 mg reference.',
          nextStep: {
            kind: 'food',
            text: 'Foods that bring calcium, per usual portion:',
            foods: [
              { key: 'curd', label: 'Curd (dahi)', perPortion: 180, portion: '1 bowl' },
              { key: 'ragi', label: 'Ragi', perPortion: 140, portion: '1 roti' },
            ],
          },
          explanation: 'A neutral comparison of the documented average with the reference. It is not a diagnosis.',
          mainSources: [
            { key: 'milk', label: 'milk', share: 0.6 },
            { key: 'paneer', label: 'paneer', share: 0.2 },
          ],
        },
        start
      ),
      assessment(
        {
          nutrient: 'iron',
          label: 'Iron',
          unit: 'mg',
          status: 'within_range',
          food: { average: 18.6, isFloor: false },
          total: 18.6,
          reference: ref('RDA', 19, 'mg'),
          trend: { kind: 'change', current: 18.6, previous: 16.2, delta: 2.4, currentDays: 3, previousDays: 4 },
          mainSources: [
            { key: 'dal', label: 'dal', share: 0.4 },
            { key: 'roti', label: 'roti', share: 0.3 },
          ],
        },
        start
      ),
      assessment({ nutrient: 'iodine', label: 'Iodine', unit: 'µg', status: 'not_enough_information', days: { documented: 0, total: 5 } }, start),
    ];
    return { start, end: TODAY, assessments, concerns: assessments.slice(0, 2) };
  };
  return {
    periods: { week: period('2026-11-09'), month: period('2026-11-01') },
    clarification: { kind: 'clarify', key: 'iodised_salt', question: 'Is the salt used at home iodised?' },
    edition: { id: 'icmr-nin-2020', name: 'ICMR-NIN Nutrient Requirements (2020)', version: '2020', reviewStatus: 'unreviewed', urls: [] },
    household: {},
    supplements: [
      { id: 'sample-supplement', name: 'Vitamin D3', brand: 'Sample brand', perDose: [{ key: 'vitamin_d', label: 'Vitamin D', amount: 25, unit: 'µg' }], takenToday: false },
    ],
    datasets: ['USDA FoodData Central (2024-10)'],
  };
}

function dashboard(scenario: GuidancePreviewScenario): GuidanceDashboard {
  const dates = Object.keys(DAYS).sort();
  const history: GuidanceDay[] = dates
    .map((date) => ({ date, loggedAt: `${date}T12:00:00`, totals: totalsFor(date, DAYS[date]) }))
    .reverse();
  const meals = dates
    .flatMap((date) => mealsFor(date, DAYS[date]))
    .sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const todayTotals = totalsFor(TODAY, DAYS[TODAY]);
  const family = scenario === 'family';
  const coach = scenario === 'coach';
  const habitOptions = HABITS;

  return {
    isPreviewOnly: true,
    timezone: TIMEZONE,
    date: TODAY,
    today: { target: TARGET, totals: todayTotals, meals: [] },
    history,
    meals,
    expectedMealsPerDay: 3,
    expectedMealsIsDefault: true,
    goals: family ? ['reduce_weight'] : ['healthy_aging'],
    weights: family
      ? [
          { measuredAt: '2026-11-09T03:00:00Z', weightKg: 78.4 },
          { measuredAt: '2026-11-13T03:00:00Z', weightKg: 77.9 },
        ]
      : [],
    logMealHref: scenario === 'self' ? 'https://wa.me/910000000000' : null,
    skips: [{ date: '2026-11-13', slot: 'dinner', confirmedVia: 'caregiver' }],
    nextSteps: {
      nextMeal: {
        date: TODAY,
        slot: 'lunch',
        isTomorrow: false,
        plan: family
          ? {
              id: 'sample-plan',
              date: TODAY,
              slot: 'lunch',
              suggestion: SUGGESTIONS[0],
              mealLogId: null,
              plannedVia: 'caregiver',
              createdAt: '2026-11-14T05:00:00Z',
              logged: null,
            }
          : null,
        suggestions: coach
          ? {
              kind: 'fallback',
              reason: 'no_options',
              message: "No option fits what's left today with the foods Tistra knows Kamlesh eats. Any balanced lunch with a protein food works.",
              notes: ['Vegetarian ideas only, until Tistra has seen more of what\'s eaten.'],
            }
          : { kind: 'options', options: SUGGESTIONS, notes: [] },
      },
      skipPrompts: coach ? ['breakfast'] : [],
      habit: {
        weekStart: '2026-11-09',
        current: family
          ? {
              ...HABITS[0],
              variant: 'standard',
              progress: { eligible: 6, successes: 4, unclear: 1, marks: [true, true, false, true, true, false], noun: 'breakfasts' },
              keptForNextWeek: false,
            }
          : null,
        options: habitOptions,
      },
    },
    micronutrients: family ? null : micronutrients(),
    generatedAt: '2026-11-14T07:00:00Z', // 12:30 pm in Kolkata
  };
}

/** What GET .../guidance would answer for each preview scenario. */
export function guidancePreviewResponse(scenario: GuidancePreviewScenario): GuidanceResponse {
  const person = scenario === 'self' ? ({ isSelf: true } as const) : ({ isSelf: false, name: 'Kamlesh' } as const);
  if (scenario === 'setup' || scenario === 'off') {
    return {
      view: {
        kind: 'setup',
        person,
        prefill: { ageYears: 58, heightCm: 168, weightKg: 77.9, metabolicEquationSex: 'male', activityLevel: 'lightly_active', goals: ['healthy_aging'] },
        isPreviewOnly: true,
        policyVersion: 'guidance-policy-v1',
        hasEverActivated: false,
        canAdjustTargets: false,
      },
      dashboard: null,
    };
  }
  if (scenario === 'paused') {
    return {
      view: {
        kind: 'paused',
        message: "Nutrition Guidance isn't available right now, so the targets are hidden. Meals are still logged as usual.",
        canReturnToTracking: true,
      },
      dashboard: null,
    };
  }
  return {
    view: {
      kind: 'active',
      person,
      activatedVia: scenario === 'coach' ? 'coach' : 'caregiver',
      isPreviewOnly: true,
      policyVersion: 'guidance-policy-v1',
      activatedAt: '2026-10-26T04:00:00Z',
      today: null,
      canReturnToTracking: scenario !== 'coach',
      adjust: null,
    },
    dashboard: dashboard(scenario),
  };
}

/** The setup flow's proposal, for the preview. Anything typed under
 * conditions or medications is declined, so that branch can be seen too. */
export function guidancePreviewProposal(answers: Record<string, unknown>): ProposalResult {
  if (typeof answers.conditionsOrMedications === 'string' && answers.conditionsOrMedications.trim()) {
    return {
      ok: false,
      kind: 'declined',
      policy: {
        outcome: 'needs_professional_review',
        reasons: ['condition_or_medication'],
        message:
          "Tistra isn't the right place to set calorie targets for this situation — a doctor or registered dietitian should. Meals can still be logged as usual.",
      },
    };
  }
  return {
    ok: true,
    targets: TARGET,
    explanation:
      'Energy: about 1,600 kcal a day to maintain weight (Mifflin-St Jeor for a 58-year-old, 168 cm, 77.9 kg, lightly active), less 10%.\nProtein: 1.2 g per kg of body weight.\nFibre: 14 g per 1,000 kcal.',
    notes: ['Sample targets for the preview. Nothing is saved.'],
    policyVersion: 'guidance-policy-v1',
    isPreviewOnly: true,
  };
}
