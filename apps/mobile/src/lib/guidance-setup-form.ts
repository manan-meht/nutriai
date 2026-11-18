// The Guidance setup form's state, wording and answers, without React.
// Mirrors initialSetupForm, setupFormToAnswers, personWords and
// hasRequiredDetails in the web app's
// src/components/guidance/GuidanceSetupForm.tsx; keep in sync by hand.
//
// One addition: validateSetupForm. The web form leans on the browser's own
// `required`, min and max to stop a submit; a phone has no such thing, so
// the same rules are checked here before anything is sent. The server
// checks again regardless (screening fails closed).
//
// The three screening questions always start blank. A "No" the person
// merely failed to notice is not an answer.
//
// Dependency-free and imported by relative path, for the root jest config.

import type { GuidancePerson, NutritionGoal, SetupPrefill } from './guidance-types';

export type YesNo = '' | 'yes' | 'no';

export interface SetupFormState {
  ageYears: string;
  heightCm: string;
  weightKg: string;
  metabolicEquationSex: '' | 'male' | 'female';
  activityLevel: string;
  goals: NutritionGoal[];
  isPregnantOrBreastfeeding: YesNo;
  hasEatingDisorderHistory: YesNo;
  conditionsOrMedications: string;
  mealsPerDay: string;
  cookingAccess: string;
  allergies: string;
  avoidedFoods: string;
  cuisines: string;
}

/** The form's wording for whoever the targets are for. */
export function personWords(person: GuidancePerson) {
  if (person.isSelf) {
    return {
      about: 'About you',
      details: 'Your details',
      aboutHint: 'Check these are current. Your targets are calculated from them.',
      active: 'How active are you?',
      healthHint:
        'These decide whether Tistra should suggest targets at all. Your answers stay private: nobody else on your account can see them.',
      pregnant: 'Are you pregnant or breastfeeding?',
      eatingDisorder: 'Have you ever had an eating disorder, or been treated for disordered eating?',
      conditions: 'Any medical conditions or medications that affect what you eat?',
      avoided: 'Foods you avoid',
      cuisines: 'Cuisines you enjoy',
    };
  }
  const name = person.name;
  return {
    about: `About ${name}`,
    details: `${name}'s details`,
    aboutHint: `Check these are current for ${name}. The targets are calculated from them.`,
    active: `How active is ${name}?`,
    healthHint: `These decide whether Tistra should suggest targets at all. Answer for ${name} as best you can, and ask them if you're not sure.`,
    pregnant: `Is ${name} pregnant or breastfeeding?`,
    eatingDisorder: `Has ${name} ever had an eating disorder, or been treated for disordered eating?`,
    conditions: `Any medical conditions or medications that affect what ${name} eats?`,
    avoided: `Foods ${name} avoids`,
    cuisines: `Cuisines ${name} enjoys`,
  };
}

export function initialSetupForm(prefill: SetupPrefill): SetupFormState {
  const num = (v: number | null | undefined) => (v == null ? '' : String(v));
  return {
    ageYears: num(prefill.ageYears),
    heightCm: num(prefill.heightCm),
    weightKg: num(prefill.weightKg),
    metabolicEquationSex: prefill.metabolicEquationSex ?? '',
    activityLevel: prefill.activityLevel ?? '',
    goals: prefill.goals ?? [],
    isPregnantOrBreastfeeding: '',
    hasEatingDisorderHistory: '',
    conditionsOrMedications: '',
    mealsPerDay: num(prefill.mealsPerDay),
    cookingAccess: prefill.cookingAccess ?? '',
    allergies: (prefill.allergies ?? []).join(', '),
    avoidedFoods: (prefill.avoidedFoods ?? []).join(', '),
    cuisines: (prefill.cuisines ?? []).join(', '),
  };
}

/** The shape the server parses. Blank stays blank (null), so the server
 * sees an unanswered question as unanswered. */
export function setupFormToAnswers(form: SetupFormState): Record<string, unknown> {
  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const yesNo = (v: YesNo) => (v === 'yes' ? true : v === 'no' ? false : null);
  const list = (v: string) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  return {
    ageYears: num(form.ageYears),
    heightCm: num(form.heightCm),
    weightKg: num(form.weightKg),
    metabolicEquationSex: form.metabolicEquationSex || null,
    activityLevel: form.activityLevel || null,
    goals: form.goals,
    isPregnantOrBreastfeeding: yesNo(form.isPregnantOrBreastfeeding),
    hasEatingDisorderHistory: yesNo(form.hasEatingDisorderHistory),
    conditionsOrMedications: form.conditionsOrMedications.trim() || null,
    mealsPerDay: num(form.mealsPerDay),
    cookingAccess: form.cookingAccess || null,
    allergies: list(form.allergies),
    avoidedFoods: list(form.avoidedFoods),
    cuisines: list(form.cuisines),
  };
}

/** The measurements the calculation cannot run without. With all of them on
 * file, the profile is a summary to confirm rather than a form to refill. */
export function hasRequiredDetails(v: SetupFormState): boolean {
  return [v.ageYears, v.heightCm, v.weightKg].every((x) => x.trim() !== '') && v.metabolicEquationSex !== '';
}

/** The ranges the web form's inputs allow (min/max on each). */
export const DETAIL_RANGES = {
  ageYears: { min: 1, max: 120, label: 'Age', unit: 'years' },
  heightCm: { min: 50, max: 250, label: 'Height', unit: 'cm' },
  weightKg: { min: 20, max: 400, label: 'Weight', unit: 'kg' },
} as const;

export type SetupFormProblem = { message: string; field: 'details' | 'health' | 'preferences' };

/** The first thing stopping the form from being sent, or null. In the same
 * order as the form, so the message names what's nearest the top. */
export function validateSetupForm(v: SetupFormState): SetupFormProblem | null {
  if (!hasRequiredDetails(v)) {
    return { field: 'details', message: 'Add age, height, weight and the sex for the energy estimate to continue.' };
  }
  for (const key of ['ageYears', 'heightCm', 'weightKg'] as const) {
    const n = Number(v[key].trim());
    const r = DETAIL_RANGES[key];
    if (!Number.isFinite(n) || n < r.min || n > r.max) {
      return { field: 'details', message: `${r.label} should be between ${r.min} and ${r.max} ${r.unit}.` };
    }
  }
  if (v.isPregnantOrBreastfeeding === '' || v.hasEatingDisorderHistory === '') {
    return { field: 'health', message: 'Answer both health questions to continue.' };
  }
  if (v.mealsPerDay.trim() !== '') {
    const n = Number(v.mealsPerDay.trim());
    if (!Number.isInteger(n) || n < 1 || n > 8) return { field: 'preferences', message: 'Meals a day should be a whole number from 1 to 8.' };
  }
  return null;
}
