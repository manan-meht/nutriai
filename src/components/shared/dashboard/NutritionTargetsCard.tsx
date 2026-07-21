"use client";

import { useEffect, useState } from "react";
import type { MacroTargets, MacroTargetValue } from "@nutriai/health-scoring";

interface NutritionTargetsCardProps {
  /** Exactly one of these is provided — same mutually-exclusive pattern as
   * FoodBalanceScoreCard (adults passes contactId, gym passes clientId). */
  contactId?: string;
  clientId?: string;
  /** Bumped by the caller after a save/reset so this card refetches
   * alongside the Food Balance Score card, which reads the same route. */
  refreshKey?: number;
  /** Called after this card itself saves/resets targets, so the parent
   * dashboard (which separately fetches activeMacroTargets for the
   * Macronutrient Summary / metric cards) can refetch too. */
  onChanged?: () => void;
}

type MacroKey = "calories" | "protein" | "carbs" | "fat" | "fiber";
const MACRO_ORDER: MacroKey[] = ["calories", "protein", "carbs", "fat", "fiber"];
const MACRO_LABELS: Record<MacroKey, string> = {
  calories: "Calories",
  protein: "Protein",
  carbs: "Carbs",
  fat: "Fat",
  fiber: "Fiber",
};

function formatValue(v: MacroTargetValue): string {
  return `${v.target.toLocaleString()} ${v.unit}${v.unit === "kcal" ? "/day" : "/day"}`;
}

function formatRange(v: MacroTargetValue): string | null {
  if (v.min == null || v.max == null) return null;
  return `Recommended range: ${Math.round(v.min).toLocaleString()}–${Math.round(v.max).toLocaleString()}`;
}

function sourceLabel(v: MacroTargetValue): string {
  if (v.source === "tistra_recommended") return "Tistra recommended";
  if (v.source === "coach_custom") return "Coach custom";
  return "Custom";
}

export function NutritionTargetsCard({ contactId, clientId, refreshKey, onChanged }: NutritionTargetsCardProps) {
  const [recommended, setRecommended] = useState<MacroTargets | null>(null);
  const [active, setActive] = useState<MacroTargets | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const path = contactId ? `/api/adults/contacts/${contactId}` : `/api/gym/clients/${clientId}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(path)
      .then((res) => (res.status === 404 ? null : res.ok ? res.json() : Promise.reject(new Error("failed"))))
      .then((data: { recommendedMacroTargets?: MacroTargets; activeMacroTargets?: MacroTargets } | null) => {
        if (cancelled || !data) return;
        setRecommended(data.recommendedMacroTargets ?? null);
        setActive(data.activeMacroTargets ?? null);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, refreshKey]);

  async function saveTargets(targets: Partial<Record<MacroKey, { min: number | null; target: number; max: number | null }>>) {
    await fetch(`${path}?resource=macro-targets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets }),
    });
    const res = await fetch(path);
    const data = await res.json();
    setActive(data.activeMacroTargets ?? null);
    onChanged?.();
  }

  async function resetTargets() {
    await fetch(`${path}?resource=macro-targets`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reset: true }),
    });
    const res = await fetch(path);
    const data = await res.json();
    setActive(data.activeMacroTargets ?? null);
    onChanged?.();
  }

  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-[var(--color-dashboard-primary)] animate-spin" aria-hidden="true" />
          Loading your nutrition targets…
        </div>
      </div>
    );
  }
  if (!active || !recommended) return null;

  const isCustomized = MACRO_ORDER.some((key) => active[key].source !== "tistra_recommended");

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5">
      <h3 className="text-base font-bold text-gray-900">Your nutrition targets</h3>
      <p className="text-sm text-gray-500 mt-1">
        Tistra suggests starting targets based on your body, goals, and food profile. You can adjust them anytime.
      </p>

      {recommended.isProfileIncomplete && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-3">
          Complete your profile (weight, height, age, gender) for more accurate targets.
        </p>
      )}

      <p className="text-xs text-gray-500 mt-3">{active.explanation}</p>

      <div className="mt-4 space-y-2">
        {MACRO_ORDER.map((key) => {
          const v = active[key];
          const range = formatRange(v);
          return (
            <div key={key} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-gray-900">{MACRO_LABELS[key]}</p>
                <p className="text-sm text-gray-700">{formatValue(v)}</p>
                {range && <p className="text-xs text-gray-400">{range}</p>}
              </div>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${v.source === "tistra_recommended" ? "bg-gray-50 text-gray-500" : "bg-[#EDE9F7] text-[#6750A4]"}`}>
                {sourceLabel(v)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
        >
          Edit targets
        </button>
        {isCustomized && (
          <button
            type="button"
            onClick={resetTargets}
            className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
          >
            Reset to Tistra recommendation
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-400 mt-3">
        These are general wellness targets, not medical advice. If you have a medical condition or prescribed diet, follow your clinician&rsquo;s guidance.
      </p>

      {editing && (
        <EditTargetsModal
          active={active}
          onClose={() => setEditing(false)}
          onSave={async (targets) => {
            await saveTargets(targets);
            setEditing(false);
          }}
          onReset={async () => {
            await resetTargets();
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function EditTargetsModal({
  active,
  onClose,
  onSave,
  onReset,
}: {
  active: MacroTargets;
  onClose: () => void;
  onSave: (targets: Partial<Record<MacroKey, { min: number | null; target: number; max: number | null }>>) => Promise<void>;
  onReset: () => Promise<void>;
}) {
  const [values, setValues] = useState<Record<MacroKey, number>>({
    calories: active.calories.target,
    protein: active.protein.target,
    carbs: active.carbs.target,
    fat: active.fat.target,
    fiber: active.fiber.target,
  });
  const [saving, setSaving] = useState(false);

  const impliedCalories = values.protein * 4 + values.carbs * 4 + values.fat * 9;
  const mismatch = Math.abs(impliedCalories - values.calories) > values.calories * 0.15;
  const hasInvalid = MACRO_ORDER.some((key) => !(values[key] >= 0));

  async function handleSave() {
    setSaving(true);
    try {
      const targets: Partial<Record<MacroKey, { min: number | null; target: number; max: number | null }>> = {};
      for (const key of MACRO_ORDER) {
        targets[key] = { min: null, target: values[key], max: null };
      }
      await onSave(targets);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <h4 className="text-base font-bold text-gray-900">Edit targets</h4>
        <div className="space-y-3 mt-3">
          {MACRO_ORDER.map((key) => (
            <label key={key} className="block">
              <span className="text-xs font-semibold text-gray-500">{MACRO_LABELS[key]} ({key === "calories" ? "kcal" : "g"})</span>
              <input
                type="number"
                min={0}
                value={values[key]}
                onChange={(e) => setValues((v) => ({ ...v, [key]: Number(e.target.value) }))}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
              />
            </label>
          ))}
        </div>

        {mismatch && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 mt-3">
            These macros don&rsquo;t fully match your calorie target. You can still save them, but Tistra&rsquo;s summaries may look less consistent.
          </p>
        )}

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            disabled={saving || hasInvalid}
            onClick={handleSave}
            className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg bg-[#6750A4] text-white disabled:opacity-50"
          >
            Save targets
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onReset}
            className="text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 text-gray-600"
          >
            Reset
          </button>
          <button type="button" onClick={onClose} className="text-sm font-medium px-3 py-2 rounded-lg text-gray-400">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
