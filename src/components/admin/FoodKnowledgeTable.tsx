"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FoodKnowledgeEntry } from "@/app/(admin)/admin/actions";
import { upsertFoodKnowledgeEntry, archiveFoodKnowledgeEntry } from "@/app/(admin)/admin/actions";

const CATEGORIES = ["protein_anchor", "partial_protein", "vegetable_fiber", "carb_base", "fat_source", "enjoyment_food", "sugary_drink", "mixed_meal", "unknown"];
const RELEVANCE = ["none", "low", "medium", "high"];

export function FoodKnowledgeTable({
  entries,
  canWrite,
  initialSearch,
}: {
  entries: FoodKnowledgeEntry[];
  canWrite: boolean;
  initialSearch: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<FoodKnowledgeEntry | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-bold text-gray-900">Food Knowledge Base</h1>
        <button
          onClick={() => setEditing("new")}
          className="bg-[var(--color-dashboard-primary)] text-white text-sm font-medium rounded-lg px-4 py-2"
        >
          Add food entry
        </button>
      </div>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={initialSearch}
          placeholder="Search food name…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs"
        />
        <button className="border border-gray-200 rounded-lg px-3 py-2 text-sm">Search</button>
      </form>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm bg-white rounded-2xl border border-gray-100">
          Add food entries to improve Tistra&apos;s Indian meal understanding.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="p-3">Food</th>
                <th className="p-3">Aliases</th>
                <th className="p-3">Region</th>
                <th className="p-3">Category</th>
                <th className="p-3">Protein</th>
                <th className="p-3">Fiber</th>
                <th className="p-3">Updated</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={`border-b border-gray-50 last:border-0 ${e.archived ? "opacity-40" : ""}`}>
                  <td className="p-3 font-medium text-gray-900">{e.foodName}</td>
                  <td className="p-3 text-gray-500">{e.aliases.join(", ") || "—"}</td>
                  <td className="p-3 text-gray-500">{e.region ?? "—"}</td>
                  <td className="p-3 text-gray-600 capitalize">{e.category.replace("_", " ")}</td>
                  <td className="p-3 text-gray-600 capitalize">{e.proteinRelevance}</td>
                  <td className="p-3 text-gray-600 capitalize">{e.fiberRelevance}</td>
                  <td className="p-3 text-gray-400">{new Date(e.updatedAt).toLocaleDateString()}</td>
                  <td className="p-3 whitespace-nowrap">
                    <button onClick={() => setEditing(e)} className="text-[var(--color-dashboard-primary)] text-sm font-medium mr-3">
                      Edit
                    </button>
                    {canWrite && !e.archived && (
                      <button
                        onClick={async () => {
                          await archiveFoodKnowledgeEntry(e.id);
                          router.refresh();
                        }}
                        className="text-[var(--color-status-support-text)] text-sm font-medium"
                      >
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <FoodEntryModal
          entry={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function FoodEntryModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: FoodKnowledgeEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [foodName, setFoodName] = useState(entry?.foodName ?? "");
  const [aliases, setAliases] = useState(entry?.aliases.join(", ") ?? "");
  const [region, setRegion] = useState(entry?.region ?? "");
  const [category, setCategory] = useState(entry?.category ?? "unknown");
  const [proteinRelevance, setProteinRelevance] = useState(entry?.proteinRelevance ?? "none");
  const [fiberRelevance, setFiberRelevance] = useState(entry?.fiberRelevance ?? "none");
  const [usualContext, setUsualContext] = useState(entry?.usualContext ?? "");
  const [commonPairings, setCommonPairings] = useState(entry?.commonPairings.join(", ") ?? "");
  const [commonMisclassifications, setCommonMisclassifications] = useState(entry?.commonMisclassifications.join(", ") ?? "");
  const [recommendedSuggestion, setRecommendedSuggestion] = useState(entry?.recommendedSuggestion ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const splitList = (s: string) => s.split(",").map((v) => v.trim()).filter(Boolean);

  async function handleSave() {
    setSaving(true);
    const result = await upsertFoodKnowledgeEntry({
      id: entry?.id,
      foodName,
      aliases: splitList(aliases),
      region: region || undefined,
      category,
      proteinRelevance,
      fiberRelevance,
      usualContext: usualContext || undefined,
      commonPairings: splitList(commonPairings),
      commonMisclassifications: splitList(commonMisclassifications),
      recommendedSuggestion: recommendedSuggestion || undefined,
    });
    setSaving(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">{entry ? "Edit food entry" : "Add food entry"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <div className="space-y-3">
          <Field label="Food name">
            <input value={foodName} onChange={(e) => setFoodName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Aliases (comma-separated)">
            <input value={aliases} onChange={(e) => setAliases(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Region">
            <input value={region} onChange={(e) => setRegion(e.target.value)} className={inputClass} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputClass} capitalize`}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c.replace("_", " ")}</option>
                ))}
              </select>
            </Field>
            <Field label="Protein relevance">
              <select value={proteinRelevance} onChange={(e) => setProteinRelevance(e.target.value)} className={`${inputClass} capitalize`}>
                {RELEVANCE.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Fiber relevance">
              <select value={fiberRelevance} onChange={(e) => setFiberRelevance(e.target.value)} className={`${inputClass} capitalize`}>
                {RELEVANCE.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Usual context">
            <input value={usualContext} onChange={(e) => setUsualContext(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Common pairings (comma-separated)">
            <input value={commonPairings} onChange={(e) => setCommonPairings(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Common misclassifications (comma-separated)">
            <input value={commonMisclassifications} onChange={(e) => setCommonMisclassifications(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Recommended suggestion">
            <textarea value={recommendedSuggestion} onChange={(e) => setRecommendedSuggestion(e.target.value)} rows={2} className={inputClass} />
          </Field>

          {error && <p className="text-sm text-[var(--color-status-support-text)]">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !foodName.trim()}
              className="flex-1 rounded-lg bg-[var(--color-dashboard-primary)] py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
