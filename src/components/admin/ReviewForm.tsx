"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MealReviewDetail, SaveReviewInput, CorrectedFoodItem } from "@/app/(admin)/admin/actions";
import { saveHumanReview, escalateReview, getNextPendingMealId } from "@/app/(admin)/admin/actions";
import { StatusBadge, reviewStatusMood } from "@/components/admin/StatusBadge";
import {
  FOOD_CATEGORIES,
  foodCategoryLabel,
  REVIEW_STATUS_OPTIONS,
  reviewStatusLabel,
  MICRONUTRIENT_STATUSES,
} from "@/lib/admin/food-categories";
import { deriveMealLevelFields } from "@/lib/admin/meal-level-derivation";
import { likelihoodToBoolean, directionToHealthy, aiFoodCategoryToKnowledgeCategory } from "@/lib/admin/ai-item-prefill";

type Detail = Exclude<MealReviewDetail, { error: string }>;

export function ReviewForm({ detail, returnQuery = "" }: { detail: Detail; returnQuery?: string }) {
  const router = useRouter();
  const { submission, classification, latestReview, mealLog, knownFoods } = detail;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxUrl) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLightboxUrl(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [lightboxUrl]);

  const [reviewStatus, setReviewStatus] = useState(latestReview?.reviewStatus ?? "correct");
  const [enjoyment, setEnjoyment] = useState(latestReview?.correctedEnjoymentFoodPresent ?? classification?.enjoymentFoodPresent ?? false);
  const [sugaryDrink, setSugaryDrink] = useState(latestReview?.correctedSugaryDrinkPresent ?? classification?.sugaryDrinkPresent ?? false);
  const [friedFood, setFriedFood] = useState(latestReview?.correctedFriedFoodPresent ?? classification?.friedFoodPresent ?? false);
  // Reviewer-set rather than derived: the knowledge base has no per-food
  // micronutrient attribute to roll up from (see food-categories.ts).
  const [micronutrientStatus, setMicronutrientStatus] = useState(
    latestReview?.correctedMicronutrientStatus ?? classification?.micronutrientStatus ?? "unknown"
  );
  const [suggestion, setSuggestion] = useState(latestReview?.correctedSuggestion ?? classification?.suggestedNextStep ?? "");
  const [notes, setNotes] = useState(latestReview?.reviewNotes ?? "");

  // Matches a typed name against the existing knowledge base (case-
  // insensitive, name or alias) so re-typing an already-known dish reuses
  // its entry instead of fragmenting into a near-duplicate ("Chicken
  // Curry" vs "Murgh Curry" vs "chicken curry").
  function matchKnownFood(name: string) {
    const lower = name.trim().toLowerCase();
    if (!lower) return undefined;
    return knownFoods.find((f) => f.foodName.toLowerCase() === lower || f.aliases.some((a) => a.toLowerCase() === lower));
  }

  const [foodItems, setFoodItems] = useState<CorrectedFoodItem[]>(() => {
    if (latestReview?.correctedFoodItemsJson?.length) return latestReview.correctedFoodItemsJson;
    const detected: string[] = (classification?.detectedItems ?? [])
      .map((f: any) => (typeof f === "string" ? f : f.name))
      .filter(Boolean);
    // A dish this reviewer (or an earlier one) has already classified
    // elsewhere prefills its known flags here — the reviewer only needs to
    // confirm or correct, not re-decide a dish from scratch every time it
    // reappears. Otherwise, rather than leaving every flag on "unknown"
    // for a brand-new dish, fall back to what the AI already decided for
    // this meal as a whole (home-cooked/ultra-processed/healthier-
    // direction likelihoods) and, for category, its per-food food_category
    // from the confirmed meal log where that's unambiguous (protein/fat
    // items only — see aiFoodCategoryToKnowledgeCategory).
    return detected.map((name) => {
      const match = matchKnownFood(name);
      const mealLogFood = mealLog?.foods.find((f: any) => (typeof f === "string" ? f : f.name)?.toLowerCase() === name.toLowerCase());
      return {
        name,
        foodKnowledgeBaseId: match?.id ?? null,
        category:
          (match?.category as CorrectedFoodItem["category"]) ??
          aiFoodCategoryToKnowledgeCategory(mealLogFood?.food_category) ??
          null,
        isHealthy: match?.isHealthy ?? directionToHealthy(classification?.healthierDirectionSignal),
        isHomeCooked: match?.isHomeCooked ?? likelihoodToBoolean(classification?.homeCookedLikelihood),
        isUltraProcessed: match?.isUltraProcessed ?? likelihoodToBoolean(classification?.ultraProcessedLikelihood),
        // null when this item has no confirmed meal_log counterpart (e.g.
        // one the reviewer just added by hand) — nothing to correct
        // against in that case, since there's no meal_logs food row to
        // write an edit back into.
        caloriesKcal: mealLogFood ? midpointValue(mealLogFood.calories_min, mealLogFood.calories_max) : null,
        proteinG: mealLogFood ? midpointValue(mealLogFood.protein_min, mealLogFood.protein_max) : null,
        carbsG: mealLogFood ? midpointValue(mealLogFood.carbs_min, mealLogFood.carbs_max) : null,
        fatG: mealLogFood ? midpointValue(mealLogFood.fat_min, mealLogFood.fat_max) : null,
      };
    });
  });

  // Rolls the per-item category + healthy/home-cooked/ultra-processed tags
  // up into the whole-meal fields the Model Quality dashboard tracks — see
  // deriveMealLevelFields for the actual rules. Recomputed on every item
  // edit so the reviewer sees the effect of their correction immediately,
  // rather than a separate set of dropdowns to keep in sync by hand.
  const derived = useMemo(() => deriveMealLevelFields(foodItems), [foodItems]);

  // Meal-level totals are always the sum of the (possibly corrected)
  // per-item macro values below — never independently editable — so they
  // can't drift out of sync with what's actually in the item list.
  const macroTotals = useMemo(
    () => ({
      caloriesKcal: foodItems.reduce((s, i) => s + (i.caloriesKcal ?? 0), 0),
      proteinG: foodItems.reduce((s, i) => s + (i.proteinG ?? 0), 0),
      carbsG: foodItems.reduce((s, i) => s + (i.carbsG ?? 0), 0),
      fatG: foodItems.reduce((s, i) => s + (i.fatG ?? 0), 0),
    }),
    [foodItems]
  );

  function updateFoodItem(index: number, patch: Partial<CorrectedFoodItem>) {
    setFoodItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addFoodItem() {
    setFoodItems((items) => [
      ...items,
      {
        name: "",
        foodKnowledgeBaseId: null,
        category: null,
        isHealthy: null,
        isHomeCooked: null,
        isUltraProcessed: null,
        caloriesKcal: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
      },
    ]);
  }

  function removeFoodItem(index: number) {
    setFoodItems((items) => items.filter((_, i) => i !== index));
  }

  function buildInput(): SaveReviewInput {
    // Re-resolves each item's foodKnowledgeBaseId at save time (not just on
    // initial load) — a reviewer may have retyped a name into one that now
    // matches an existing entry.
    const correctedFoodItems = foodItems
      .filter((item) => item.name.trim())
      .map((item) => ({ ...item, name: item.name.trim(), foodKnowledgeBaseId: item.foodKnowledgeBaseId ?? matchKnownFood(item.name)?.id ?? null }));

    // Only items actually edited from the AI's own midpoint are sent —
    // an untouched item shouldn't count as a "correction" in the audit
    // trail, and there's no need to rewrite meal_logs rows nobody changed.
    const correctedMealMacros = foodItems
      .filter((item): item is CorrectedFoodItem & { caloriesKcal: number; proteinG: number; carbsG: number; fatG: number } => {
        if (item.caloriesKcal == null || item.proteinG == null || item.carbsG == null || item.fatG == null) return false;
        const original = mealLog?.foods.find((f: any) => (typeof f === "string" ? f : f.name)?.toLowerCase() === item.name.toLowerCase());
        if (!original) return false;
        return (
          item.caloriesKcal !== midpointValue(original.calories_min, original.calories_max) ||
          item.proteinG !== midpointValue(original.protein_min, original.protein_max) ||
          item.carbsG !== midpointValue(original.carbs_min, original.carbs_max) ||
          item.fatG !== midpointValue(original.fat_min, original.fat_max)
        );
      })
      .map((item) => ({ name: item.name, caloriesKcal: item.caloriesKcal, proteinG: item.proteinG, carbsG: item.carbsG, fatG: item.fatG }));

    return {
      mealSubmissionId: submission.id,
      aiClassificationId: classification?.id ?? null,
      reviewStatus: reviewStatus as SaveReviewInput["reviewStatus"],
      correctedItemsJson: correctedFoodItems.map((item) => item.name),
      correctedFoodItems,
      correctedMealMacros: correctedMealMacros.length ? correctedMealMacros : undefined,
      mealLogId: mealLog?.id ?? null,
      correctedProteinAnchorStatus: derived.proteinAnchorStatus,
      correctedVegetableFiberStatus: derived.vegetableFiberStatus,
      correctedCarbStatus: derived.carbStatus,
      correctedMealBalanceStatus: derived.mealBalanceStatus,
      correctedHomeCookedLikelihood: derived.homeCookedLikelihood,
      correctedEnjoymentFoodPresent: enjoyment,
      correctedSugaryDrinkPresent: sugaryDrink,
      correctedFriedFoodPresent: friedFood,
      correctedUltraProcessedLikelihood: derived.ultraProcessedLikelihood,
      correctedHealthierDirectionSignal: derived.healthierDirectionSignal,
      correctedMicronutrientStatus: micronutrientStatus as SaveReviewInput["correctedMicronutrientStatus"],
      correctedSuggestion: suggestion || undefined,
      reviewNotes: notes || undefined,
    };
  }

  async function handleSave(andNext: boolean) {
    setSaving(true);
    setMessage(null);
    const result = await saveHumanReview(buildInput());
    if ("error" in result) {
      setMessage(result.error);
      setSaving(false);
      return;
    }
    if (andNext) {
      const next = await getNextPendingMealId(submission.id);
      setSaving(false);
      if (!("error" in next) && next.id) {
        router.push(`/admin?id=${next.id}${returnQuery ? `&${returnQuery}` : ""}`);
        return;
      }
      router.push(returnQuery ? `/admin?${returnQuery}` : "/admin");
      return;
    }
    setSaving(false);
    setMessage("Review saved.");
    router.refresh();
  }

  async function handleMarkUnclear() {
    setReviewStatus("unclear_image");
    setSaving(true);
    const result = await saveHumanReview({ ...buildInput(), reviewStatus: "unclear_image" });
    setSaving(false);
    setMessage("error" in result ? result.error : "Marked as unclear image.");
    router.refresh();
  }

  async function handleEscalate() {
    setSaving(true);
    const result = await escalateReview(submission.id, notes || undefined);
    setSaving(false);
    setMessage("error" in result ? result.error : "Escalated to nutrition expert.");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: original submission */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {submission.imageUrl ? (
            <button
              type="button"
              onClick={() => setLightboxUrl(submission.imageUrl)}
              className="block w-full cursor-zoom-in"
              aria-label="Enlarge meal photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL */}
              <img src={submission.imageUrl} alt="Meal submission" className="w-full max-h-96 object-cover" />
            </button>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400 text-sm">No photo available</div>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2 text-sm">
          <Row label="Caption">{submission.caption ?? "—"}</Row>
          <Row label="Submitted">{new Date(submission.submittedAt).toLocaleString("en-IN")}</Row>
          <Row label="Meal type" className="capitalize">{submission.mealType}</Row>
          <Row label="Source" className="capitalize">{submission.source}</Row>
          <Row label="Market">{submission.market ?? "—"}</Row>
          <Row label="Image quality" className="capitalize">{submission.imageQuality.replace("_", " ")}</Row>
          <Row label="User">{submission.anonymizedUserId}</Row>
        </div>
        {detail.sameDaySubmissions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Same-day meals</p>
            <div className="flex gap-2 flex-wrap">
              {detail.sameDaySubmissions.map((m) => (
                <a key={m.id} href={`/admin?id=${m.id}`} className="block">
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
                    <img src={m.imageUrl} alt={m.mealType} className="w-14 h-14 rounded-lg object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-gray-100" />
                  )}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: AI output + correction form */}
      <div className="space-y-4">
        {!classification ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-gray-400">
            This meal does not have an AI classification yet.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm space-y-1">
            <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-2">AI classification</p>
            {classification.neededClarification && (
              <div className="mb-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-900">
                <p className="font-semibold text-xs uppercase tracking-wide mb-1">AI asked a follow-up question</p>
                <p>{classification.clarificationQuestion}</p>
                {classification.highImpactAmbiguityReason && (
                  <p className="text-xs text-amber-700 mt-1">{classification.highImpactAmbiguityReason}</p>
                )}
              </div>
            )}
            <Row label="Model">{classification.modelName} {classification.modelVersion ?? ""} / prompt {classification.promptVersion ?? "—"}</Row>
            <Row label="Confidence">{classification.confidenceScore != null ? `${Math.round(classification.confidenceScore * 100)}%` : "—"}</Row>
            <Row label="Detected items">
              {classification.detectedItems.length
                ? classification.detectedItems.map((f: any, i: number) => {
                    const name = typeof f === "string" ? f : f.name;
                    const isAmbiguous = classification.ambiguousItemName === name;
                    return (
                      <span key={i}>
                        {i > 0 && ", "}
                        {isAmbiguous ? <mark className="bg-amber-200 text-amber-900 rounded px-0.5">{name}</mark> : name}
                      </span>
                    );
                  })
                : "—"}
            </Row>
            {mealLog ? (
              <>
                <Row label="Calories">{macroTotals.caloriesKcal}</Row>
                <Row label="Protein">{macroTotals.proteinG}g</Row>
                <Row label="Carbs">{macroTotals.carbsG}g</Row>
                <Row label="Fat">{macroTotals.fatG}g</Row>
              </>
            ) : (
              <Row label="Macros">Not available — this submission isn&apos;t linked to a confirmed meal log yet.</Row>
            )}
            <Row label="Suggested next step">{classification.suggestedNextStep ?? "—"}</Row>
          </div>
        )}

        {mealLog && mealLog.foods.some((f: any) => f.visible_quantity) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm">
            <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest mb-2">Visible quantities</p>
            <div className="space-y-1">
              {mealLog.foods
                .filter((f: any) => f.visible_quantity)
                .map((f: any, i: number) => (
                  <Row key={i} label={f.name ?? "Unknown item"}>{f.visible_quantity}</Row>
                ))}
            </div>
          </div>
        )}

        {!latestReview && (
          <div className="text-xs text-gray-400 px-1">This meal has not been reviewed.</div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <p className="text-xs font-semibold text-[var(--color-dashboard-primary)] uppercase tracking-widest">Review result</p>
          <div className="flex flex-wrap gap-2">
            {REVIEW_STATUS_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => setReviewStatus(opt)}
                className={`text-xs rounded-full px-3 py-1 border ${
                  reviewStatus === opt ? "border-transparent" : "border-gray-200 text-gray-500"
                }`}
              >
                {reviewStatus === opt ? <StatusBadge label={reviewStatusLabel(opt)} mood={reviewStatusMood(opt)} /> : reviewStatusLabel(opt)}
              </button>
            ))}
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1.5">Food items</p>
            <datalist id="known-foods-list">
              {knownFoods.map((f) => (
                <option key={f.id} value={f.foodName} />
              ))}
            </datalist>
            <div className="space-y-2">
              {foodItems.map((item, i) => {
                const isAmbiguous = classification?.ambiguousItemName === item.name;
                const hasMacros = item.caloriesKcal != null && item.proteinG != null && item.carbsG != null && item.fatG != null;
                return (
                <div
                  key={i}
                  className={`border rounded-lg p-2 space-y-2 ${isAmbiguous ? "border-amber-300 bg-amber-50" : "border-gray-100"}`}
                  title={isAmbiguous ? classification?.clarificationQuestion ?? undefined : undefined}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {isAmbiguous && <span className="text-xs">❓</span>}
                    <input
                      list="known-foods-list"
                      value={item.name}
                      onChange={(e) => {
                        const match = matchKnownFood(e.target.value);
                        updateFoodItem(i, {
                          name: e.target.value,
                          foodKnowledgeBaseId: match?.id ?? null,
                          category: (match?.category as CorrectedFoodItem["category"]) ?? item.category,
                          isHealthy: match?.isHealthy ?? item.isHealthy,
                          isHomeCooked: match?.isHomeCooked ?? item.isHomeCooked,
                          isUltraProcessed: match?.isUltraProcessed ?? item.isUltraProcessed,
                        });
                      }}
                      placeholder="Food name"
                      className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                    />
                    <select
                      value={item.category ?? "unknown"}
                      onChange={(e) => updateFoodItem(i, { category: e.target.value as CorrectedFoodItem["category"] })}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-xs capitalize"
                    >
                      {FOOD_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input type="checkbox" checked={item.isHealthy === true} onChange={(e) => updateFoodItem(i, { isHealthy: e.target.checked })} />
                      Healthy
                    </label>
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={item.isHomeCooked === true}
                        onChange={(e) => updateFoodItem(i, { isHomeCooked: e.target.checked })}
                      />
                      Home-cooked
                    </label>
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={item.isUltraProcessed === true}
                        onChange={(e) => updateFoodItem(i, { isUltraProcessed: e.target.checked })}
                      />
                      Ultra-processed
                    </label>
                    <button
                      type="button"
                      onClick={() => removeFoodItem(i)}
                      aria-label={`Remove ${item.name || "item"}`}
                      className="text-gray-400 hover:text-red-600 text-sm px-1"
                    >
                      ×
                    </button>
                  </div>
                  {hasMacros && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                      <label className="flex items-center gap-1">
                        <input
                          type="number"
                          value={item.caloriesKcal ?? 0}
                          onChange={(e) => updateFoodItem(i, { caloriesKcal: Number(e.target.value) })}
                          className="w-16 border border-gray-200 rounded px-1.5 py-1"
                        />
                        cal
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="number"
                          value={item.proteinG ?? 0}
                          onChange={(e) => updateFoodItem(i, { proteinG: Number(e.target.value) })}
                          className="w-14 border border-gray-200 rounded px-1.5 py-1"
                        />
                        g protein
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="number"
                          value={item.carbsG ?? 0}
                          onChange={(e) => updateFoodItem(i, { carbsG: Number(e.target.value) })}
                          className="w-14 border border-gray-200 rounded px-1.5 py-1"
                        />
                        g carbs
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="number"
                          value={item.fatG ?? 0}
                          onChange={(e) => updateFoodItem(i, { fatG: Number(e.target.value) })}
                          className="w-14 border border-gray-200 rounded px-1.5 py-1"
                        />
                        g fat
                      </label>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addFoodItem}
              className="mt-2 text-xs font-medium text-[var(--color-dashboard-primary)]"
            >
              + Add item
            </button>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1.5">Derived from the items above</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm bg-gray-50 rounded-lg p-3">
              <Row label="Protein anchor" className="capitalize">{derived.proteinAnchorStatus.replace("_", " ")}</Row>
              <Row label="Vegetable/fiber" className="capitalize">{derived.vegetableFiberStatus.replace("_", " ")}</Row>
              <Row label="Carb status" className="capitalize">{derived.carbStatus.replace("_", " ")}</Row>
              <Row label="Meal balance" className="capitalize">{derived.mealBalanceStatus.replace("_", " ")}</Row>
              <Row label="Home-cooked" className="capitalize">{derived.homeCookedLikelihood.replace("_", " ")}</Row>
              <Row label="Ultra-processed" className="capitalize">{derived.ultraProcessedLikelihood.replace("_", " ")}</Row>
              <Row label="Healthier direction" className="capitalize">{derived.healthierDirectionSignal.replace("_", " ")}</Row>
            </div>
          </div>

          <div className="flex gap-4 text-sm text-gray-600">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={enjoyment} onChange={(e) => setEnjoyment(e.target.checked)} /> Treat food
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={sugaryDrink} onChange={(e) => setSugaryDrink(e.target.checked)} /> Sugary drink
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={friedFood} onChange={(e) => setFriedFood(e.target.checked)} /> Fried food
            </label>
          </div>

          <Field label="Micronutrients">
            <select
              value={micronutrientStatus}
              onChange={(e) => setMicronutrientStatus(e.target.value)}
              className={inputClass}
            >
              {MICRONUTRIENT_STATUSES.map((opt) => (
                <option key={opt} value={opt} className="capitalize">
                  {opt}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Your own call — unlike the derived fields above, this isn&rsquo;t rolled up from the items,
              and the model doesn&rsquo;t estimate it yet.
            </p>
          </Field>

          <Field label="Corrected coaching suggestion">
            <textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} rows={2} className={inputClass} />
            <p className="text-xs text-gray-400 mt-1">
              Use non-judgmental language. Avoid &ldquo;bad food,&rdquo; &ldquo;cheat meal,&rdquo; &ldquo;unhealthy,&rdquo; &ldquo;failed,&rdquo; or &ldquo;poor choice.&rdquo;
            </p>
            <p className="text-xs text-gray-500 mt-1.5 bg-gray-50 border border-gray-100 rounded-lg p-2">
              <strong className="font-medium">Applies to this meal only.</strong> Saving rewrites what this
              person sees for this meal on their dashboard. It does <em>not</em> feed back into future
              classifications — nothing reads past corrections when analysing a new photo yet.
            </p>
          </Field>

          <Field label="Reviewer notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} />
          </Field>

          {message && <p className="text-sm text-[var(--color-dashboard-primary)]">{message}</p>}

          <div className="flex flex-wrap gap-2 pt-2">
            <button onClick={() => handleSave(false)} disabled={saving} className="bg-[var(--color-dashboard-primary)] text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50">
              Save review
            </button>
            <button onClick={() => handleSave(true)} disabled={saving} className="bg-[var(--color-dashboard-primary)] text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50">
              Save and next
            </button>
            <button onClick={handleMarkUnclear} disabled={saving} className="border border-gray-200 text-gray-700 text-sm font-medium rounded-lg px-4 py-2">
              Mark unclear
            </button>
            <button onClick={handleEscalate} disabled={saving} className="border border-gray-200 text-gray-700 text-sm font-medium rounded-lg px-4 py-2">
              Escalate to nutrition expert
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Saving also updates the food knowledge base for every named item above — healthy/home-cooked/ultra-processed flags carry forward the next time each dish appears.
          </p>
        </div>
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white text-3xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL */}
          <img
            src={lightboxUrl}
            alt="Meal submission enlarged"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[90vh] rounded-2xl object-contain cursor-default"
          />
        </div>
      )}
    </div>
  );
}

const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm";

// Always the midpoint of the model's min/max estimate, never the raw
// range — every other surface (dashboards, WhatsApp replies) already shows
// a single number, so showing a range here too would be an inconsistency
// with no benefit: reviewers correct against `reviewStatus`/the categorical
// fields below, never against the raw min/max spread itself.
function midpointValue(min: number | null | undefined, max: number | null | undefined): number {
  return Math.round(((min ?? max ?? 0) + (max ?? min ?? 0)) / 2);
}

function formatMidpoint(min: number | null | undefined, max: number | null | undefined, unit = ""): string {
  if (min == null && max == null) return "—";
  return `${midpointValue(min, max)}${unit}`;
}

function Row({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-400">{label}</span>
      <span className={`text-gray-800 text-right ${className}`}>{children}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

