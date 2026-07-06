"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MealReviewDetail, SaveReviewInput } from "@/app/(admin)/admin/actions";
import { saveHumanReview, escalateReview, getNextPendingMealId, addFoodToKnowledgeBase } from "@/app/(admin)/admin/actions";
import { StatusBadge, reviewStatusMood } from "@/components/admin/StatusBadge";

const REVIEW_STATUS_OPTIONS = ["correct", "partially_correct", "incorrect", "unclear_photo", "not_food", "duplicate", "escalated"];
const PRESENCE_OPTIONS = ["missing", "partial", "present", "unknown"];
const CARB_OPTIONS = ["missing", "present", "dominant", "unknown"];
const BALANCE_OPTIONS = ["needs_support", "moderate", "strong", "unknown"];
const LIKELIHOOD_OPTIONS = ["low", "medium", "high", "unknown"];
const DIRECTION_OPTIONS = ["negative", "neutral", "positive", "unknown"];

type Detail = Exclude<MealReviewDetail, { error: string }>;

export function ReviewForm({ detail }: { detail: Detail }) {
  const router = useRouter();
  const { submission, classification, latestReview } = detail;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [reviewStatus, setReviewStatus] = useState(latestReview?.reviewStatus ?? "correct");
  const [proteinStatus, setProteinStatus] = useState(latestReview?.correctedProteinAnchorStatus ?? classification?.proteinAnchorStatus ?? "unknown");
  const [vegStatus, setVegStatus] = useState(latestReview?.correctedVegetableFiberStatus ?? classification?.vegetableFiberStatus ?? "unknown");
  const [carbStatus, setCarbStatus] = useState(latestReview?.correctedCarbStatus ?? classification?.carbStatus ?? "unknown");
  const [balanceStatus, setBalanceStatus] = useState(latestReview?.correctedMealBalanceStatus ?? classification?.mealBalanceStatus ?? "unknown");
  const [homeCooked, setHomeCooked] = useState(latestReview?.correctedHomeCookedLikelihood ?? classification?.homeCookedLikelihood ?? "unknown");
  const [enjoyment, setEnjoyment] = useState(latestReview?.correctedEnjoymentFoodPresent ?? classification?.enjoymentFoodPresent ?? false);
  const [sugaryDrink, setSugaryDrink] = useState(latestReview?.correctedSugaryDrinkPresent ?? classification?.sugaryDrinkPresent ?? false);
  const [friedFood, setFriedFood] = useState(latestReview?.correctedFriedFoodPresent ?? classification?.friedFoodPresent ?? false);
  const [ultraProcessed, setUltraProcessed] = useState(latestReview?.correctedUltraProcessedLikelihood ?? classification?.ultraProcessedLikelihood ?? "unknown");
  const [direction, setDirection] = useState(latestReview?.correctedHealthierDirectionSignal ?? classification?.healthierDirectionSignal ?? "unknown");
  const [suggestion, setSuggestion] = useState(latestReview?.correctedSuggestion ?? classification?.suggestedNextStep ?? "");
  const [notes, setNotes] = useState(latestReview?.reviewNotes ?? "");
  const [itemsText, setItemsText] = useState(
    latestReview?.correctedItemsJson
      ? JSON.stringify(latestReview.correctedItemsJson)
      : JSON.stringify(classification?.detectedItems ?? [])
  );

  function buildInput(): SaveReviewInput {
    let correctedItemsJson: unknown = undefined;
    try {
      correctedItemsJson = JSON.parse(itemsText);
    } catch {
      correctedItemsJson = itemsText;
    }
    return {
      mealSubmissionId: submission.id,
      aiClassificationId: classification?.id ?? null,
      reviewStatus: reviewStatus as SaveReviewInput["reviewStatus"],
      correctedItemsJson,
      correctedProteinAnchorStatus: proteinStatus as SaveReviewInput["correctedProteinAnchorStatus"],
      correctedVegetableFiberStatus: vegStatus as SaveReviewInput["correctedVegetableFiberStatus"],
      correctedCarbStatus: carbStatus as SaveReviewInput["correctedCarbStatus"],
      correctedMealBalanceStatus: balanceStatus as SaveReviewInput["correctedMealBalanceStatus"],
      correctedHomeCookedLikelihood: homeCooked as SaveReviewInput["correctedHomeCookedLikelihood"],
      correctedEnjoymentFoodPresent: enjoyment,
      correctedSugaryDrinkPresent: sugaryDrink,
      correctedFriedFoodPresent: friedFood,
      correctedUltraProcessedLikelihood: ultraProcessed as SaveReviewInput["correctedUltraProcessedLikelihood"],
      correctedHealthierDirectionSignal: direction as SaveReviewInput["correctedHealthierDirectionSignal"],
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
        router.push(`/admin/meal-review/${next.id}`);
        return;
      }
      router.push("/admin/meal-review");
      return;
    }
    setSaving(false);
    setMessage("Review saved.");
    router.refresh();
  }

  async function handleMarkUnclear() {
    setReviewStatus("unclear_photo");
    setSaving(true);
    const result = await saveHumanReview({ ...buildInput(), reviewStatus: "unclear_photo" });
    setSaving(false);
    setMessage("error" in result ? result.error : "Marked as unclear photo.");
    router.refresh();
  }

  async function handleEscalate() {
    setSaving(true);
    const result = await escalateReview(submission.id, notes || undefined);
    setSaving(false);
    setMessage("error" in result ? result.error : "Escalated to nutrition expert.");
    router.refresh();
  }

  async function handleAddToKnowledgeBase() {
    let firstFood: string | undefined;
    try {
      const parsed = JSON.parse(itemsText);
      firstFood = Array.isArray(parsed) ? (typeof parsed[0] === "string" ? parsed[0] : parsed[0]?.name) : undefined;
    } catch {
      firstFood = itemsText.split(",")[0]?.trim();
    }
    if (!firstFood) {
      setMessage("No food item found to add.");
      return;
    }
    const result = await addFoodToKnowledgeBase(submission.id, firstFood);
    setMessage("error" in result ? result.error : `Added "${firstFood}" to the food knowledge base.`);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: original submission */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          {submission.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
            <img src={submission.imageUrl} alt="Meal submission" className="w-full max-h-96 object-cover" />
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
                <a key={m.id} href={`/admin/meal-review/${m.id}`} className="block">
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
            <Row label="Model">{classification.modelName} {classification.modelVersion ?? ""} / prompt {classification.promptVersion ?? "—"}</Row>
            <Row label="Confidence">{classification.confidenceScore != null ? `${Math.round(classification.confidenceScore * 100)}%` : "—"}</Row>
            <Row label="Detected items">{classification.detectedItems.map((f: any) => (typeof f === "string" ? f : f.name)).join(", ") || "—"}</Row>
            <Row label="Suggested next step">{classification.suggestedNextStep ?? "—"}</Row>
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
                {reviewStatus === opt ? <StatusBadge label={opt.replace("_", " ")} mood={reviewStatusMood(opt)} /> : opt.replace("_", " ")}
              </button>
            ))}
          </div>

          <Field label="Food items (JSON array or comma-separated)">
            <textarea value={itemsText} onChange={(e) => setItemsText(e.target.value)} rows={2} className={inputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Protein anchor" value={proteinStatus} onChange={setProteinStatus} options={PRESENCE_OPTIONS} />
            <SelectField label="Vegetable/fiber" value={vegStatus} onChange={setVegStatus} options={PRESENCE_OPTIONS} />
            <SelectField label="Carb status" value={carbStatus} onChange={setCarbStatus} options={CARB_OPTIONS} />
            <SelectField label="Meal balance" value={balanceStatus} onChange={setBalanceStatus} options={BALANCE_OPTIONS} />
            <SelectField label="Home-cooked likelihood" value={homeCooked} onChange={setHomeCooked} options={LIKELIHOOD_OPTIONS} />
            <SelectField label="Ultra-processed likelihood" value={ultraProcessed} onChange={setUltraProcessed} options={LIKELIHOOD_OPTIONS} />
            <SelectField label="Healthier direction signal" value={direction} onChange={setDirection} options={DIRECTION_OPTIONS} />
          </div>

          <div className="flex gap-4 text-sm text-gray-600">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={enjoyment} onChange={(e) => setEnjoyment(e.target.checked)} /> Enjoyment food
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={sugaryDrink} onChange={(e) => setSugaryDrink(e.target.checked)} /> Sugary drink
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={friedFood} onChange={(e) => setFriedFood(e.target.checked)} /> Fried food
            </label>
          </div>

          <Field label="Corrected coaching suggestion">
            <textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} rows={2} className={inputClass} />
            <p className="text-xs text-gray-400 mt-1">
              Use non-judgmental language. Avoid &ldquo;bad food,&rdquo; &ldquo;cheat meal,&rdquo; &ldquo;unhealthy,&rdquo; &ldquo;failed,&rdquo; or &ldquo;poor choice.&rdquo;
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
            <button onClick={handleAddToKnowledgeBase} disabled={saving} className="border border-gray-200 text-gray-700 text-sm font-medium rounded-lg px-4 py-2">
              Add selected food to knowledge base
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm";

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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} capitalize`}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o.replace("_", " ")}
          </option>
        ))}
      </select>
    </label>
  );
}
