"use client";

import type { NutritionGoal } from "@nutriai/health-scoring";

import { ACTIVITY_LEVEL_OPTIONS, NUTRITION_GOAL_OPTIONS } from "@/lib/food-balance/goal-options";
import type { GuidancePerson, SetupPrefill } from "@/lib/guidance/view";

// The questions behind a target. Measurements and goals start from what
// the profile already holds, shown for the person to confirm. The three
// screening questions always start blank, with no default radio selected:
// a "No" the person merely failed to notice is not an answer, and the
// browser's own `required` stops the form going anywhere until each is
// chosen. The server checks again regardless (screening fails closed).
//
// The same form serves the tracked person and the caregiver or coach
// setting it up for them, so every question is worded for whichever it is.

type YesNo = "" | "yes" | "no";

export interface SetupFormState {
  ageYears: string;
  heightCm: string;
  weightKg: string;
  metabolicEquationSex: "" | "male" | "female";
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
      about: "About you",
      aboutHint: "Check these are current. Your targets are calculated from them.",
      active: "How active are you?",
      healthHint:
        "These decide whether Tistra should suggest targets at all. Your answers stay private: nobody else on your account can see them.",
      pregnant: "Are you pregnant or breastfeeding?",
      eatingDisorder: "Have you ever had an eating disorder, or been treated for disordered eating?",
      conditions: "Any medical conditions or medications that affect what you eat?",
      avoided: "Foods you avoid",
      cuisines: "Cuisines you enjoy",
    };
  }
  const name = person.name;
  return {
    about: `About ${name}`,
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
  const num = (v: number | null | undefined) => (v == null ? "" : String(v));
  return {
    ageYears: num(prefill.ageYears),
    heightCm: num(prefill.heightCm),
    weightKg: num(prefill.weightKg),
    metabolicEquationSex: prefill.metabolicEquationSex ?? "",
    activityLevel: prefill.activityLevel ?? "",
    goals: prefill.goals ?? [],
    isPregnantOrBreastfeeding: "",
    hasEatingDisorderHistory: "",
    conditionsOrMedications: "",
    mealsPerDay: num(prefill.mealsPerDay),
    cookingAccess: prefill.cookingAccess ?? "",
    allergies: (prefill.allergies ?? []).join(", "),
    avoidedFoods: (prefill.avoidedFoods ?? []).join(", "),
    cuisines: (prefill.cuisines ?? []).join(", "),
  };
}

/** The shape the server actions parse. Blank stays blank (null), so the
 * server sees an unanswered question as unanswered. */
export function setupFormToAnswers(form: SetupFormState): Record<string, unknown> {
  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const yesNo = (v: YesNo) => (v === "yes" ? true : v === "no" ? false : null);
  const list = (v: string) =>
    v
      .split(",")
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

const input =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-300 outline-none focus:border-[var(--color-dashboard-primary)] focus:ring-2 focus:ring-[var(--color-dashboard-primary-light)] transition";
const label = "block text-sm font-medium text-gray-900 mb-1.5";
const hint = "text-xs text-gray-500 mt-1";

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-100 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function YesNoQuestion({
  name,
  question,
  value,
  onChange,
}: {
  name: string;
  question: string;
  value: YesNo;
  onChange: (value: YesNo) => void;
}) {
  return (
    <fieldset>
      <legend className={label}>{question}</legend>
      <div className="flex gap-3">
        {(["yes", "no"] as const).map((option) => (
          <label
            key={option}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm cursor-pointer transition ${
              value === option
                ? "border-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)] text-gray-900"
                : "border-gray-200 text-gray-700 hover:bg-gray-50"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => onChange(option)}
              required
              className="accent-[var(--color-dashboard-primary)]"
            />
            {option === "yes" ? "Yes" : "No"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function GuidanceSetupForm({
  person,
  value,
  onChange,
}: {
  person: GuidancePerson;
  value: SetupFormState;
  onChange: (value: SetupFormState) => void;
}) {
  const words = personWords(person);
  const set = <K extends keyof SetupFormState>(key: K, v: SetupFormState[K]) => onChange({ ...value, [key]: v });

  function toggleGoal(goal: NutritionGoal) {
    set("goals", value.goals.includes(goal) ? value.goals.filter((g) => g !== goal) : [...value.goals, goal]);
  }

  return (
    <div className="space-y-4">
      <Section title={words.about} description={words.aboutHint}>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="guidance-age" className={label}>Age</label>
            <input id="guidance-age" className={input} type="number" inputMode="numeric" min={1} max={120} required
              value={value.ageYears} onChange={(e) => set("ageYears", e.target.value)} />
          </div>
          <div>
            <label htmlFor="guidance-height" className={label}>Height (cm)</label>
            <input id="guidance-height" className={input} type="number" inputMode="decimal" min={50} max={250} step="0.1" required
              value={value.heightCm} onChange={(e) => set("heightCm", e.target.value)} />
          </div>
          <div>
            <label htmlFor="guidance-weight" className={label}>Weight (kg)</label>
            <input id="guidance-weight" className={input} type="number" inputMode="decimal" min={20} max={400} step="0.1" required
              value={value.weightKg} onChange={(e) => set("weightKg", e.target.value)} />
          </div>
        </div>

        <fieldset>
          <legend className={label}>Sex for the energy estimate</legend>
          <div className="flex gap-3">
            {(["female", "male"] as const).map((option) => (
              <label
                key={option}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm cursor-pointer transition ${
                  value.metabolicEquationSex === option
                    ? "border-[var(--color-dashboard-primary)] bg-[var(--color-dashboard-primary-light)] text-gray-900"
                    : "border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <input type="radio" name="guidance-sex" value={option} checked={value.metabolicEquationSex === option}
                  onChange={() => set("metabolicEquationSex", option)} required className="accent-[var(--color-dashboard-primary)]" />
                {option === "female" ? "Female" : "Male"}
              </label>
            ))}
          </div>
          <p className={hint}>The calorie equation has separate versions for female and male bodies. It isn&apos;t used for anything else.</p>
        </fieldset>

        <div>
          <label htmlFor="guidance-activity" className={label}>{words.active}</label>
          <select id="guidance-activity" className={input} value={value.activityLevel} onChange={(e) => set("activityLevel", e.target.value)}>
            <option value="">Choose one</option>
            {ACTIVITY_LEVEL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className={label}>Goals</legend>
          <div className="space-y-2">
            {NUTRITION_GOAL_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 cursor-pointer hover:bg-gray-50">
                <input type="checkbox" checked={value.goals.includes(o.value)} onChange={() => toggleGoal(o.value)}
                  className="mt-0.5 accent-[var(--color-dashboard-primary)]" />
                <span>
                  <span className="block text-sm text-gray-900">{o.label}</span>
                  <span className="block text-xs text-gray-500">{o.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section title="A few health questions" description={words.healthHint}>
        <YesNoQuestion name="guidance-pregnant" question={words.pregnant}
          value={value.isPregnantOrBreastfeeding} onChange={(v) => set("isPregnantOrBreastfeeding", v)} />
        <YesNoQuestion name="guidance-eating-disorder" question={words.eatingDisorder}
          value={value.hasEatingDisorderHistory} onChange={(v) => set("hasEatingDisorderHistory", v)} />
        <div>
          <label htmlFor="guidance-conditions" className={label}>{words.conditions}</label>
          <textarea id="guidance-conditions" className={input} rows={2} maxLength={1000} placeholder="Optional, in your own words"
            value={value.conditionsOrMedications} onChange={(e) => set("conditionsOrMedications", e.target.value)} />
        </div>
      </Section>

      <Section title="Preferences" description="Optional. These shape future meal suggestions, never the targets themselves.">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="guidance-meals" className={label}>Meals a day</label>
            <input id="guidance-meals" className={input} type="number" inputMode="numeric" min={1} max={8}
              value={value.mealsPerDay} onChange={(e) => set("mealsPerDay", e.target.value)} />
          </div>
          <div>
            <label htmlFor="guidance-cooking" className={label}>Cooking</label>
            <select id="guidance-cooking" className={input} value={value.cookingAccess} onChange={(e) => set("cookingAccess", e.target.value)}>
              <option value="">Not sure</option>
              <option value="full_kitchen">Full kitchen</option>
              <option value="limited">Limited</option>
              <option value="none">No cooking</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="guidance-allergies" className={label}>Allergies</label>
          <input id="guidance-allergies" className={input} placeholder="e.g. peanuts, shellfish"
            value={value.allergies} onChange={(e) => set("allergies", e.target.value)} />
        </div>
        <div>
          <label htmlFor="guidance-avoided" className={label}>{words.avoided}</label>
          <input id="guidance-avoided" className={input} placeholder="e.g. beef, mushrooms"
            value={value.avoidedFoods} onChange={(e) => set("avoidedFoods", e.target.value)} />
        </div>
        <div>
          <label htmlFor="guidance-cuisines" className={label}>{words.cuisines}</label>
          <input id="guidance-cuisines" className={input} placeholder="e.g. South Indian, Thai"
            value={value.cuisines} onChange={(e) => set("cuisines", e.target.value)} />
          <p className={hint}>Separate items with commas.</p>
        </div>
      </Section>
    </div>
  );
}
