"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { BIOMARKERS, BIOMARKER_KEYS, DERIVED_MARKERS, formatValue, type BiomarkerKey } from "@/lib/biomarkers";
import type { BiomarkerLog } from "@/app/(gym)/gym/dashboard/actions";
import { updateTrackedBiomarkers, logBiomarker } from "@/app/(gym)/gym/dashboard/actions";

const BiomarkerChart = dynamic(() => import("./BiomarkerChart").then((m) => m.BiomarkerChart), {
  ssr: false,
  loading: () => <div className="h-32 bg-gray-50 rounded-xl animate-pulse" />,
});

interface Props {
  clientId: string;
  heightCm?: number;
  trackedBiomarkers: string[];
  biomarkers: BiomarkerLog[];
}

export function BiomarkerSection({ clientId, heightCm, trackedBiomarkers, biomarkers }: Props) {
  const router = useRouter();
  const [showConfig, setShowConfig] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const tracked = trackedBiomarkers as BiomarkerKey[];
  const latest = biomarkers[biomarkers.length - 1];
  const first = biomarkers[0];

  function getDelta(key: BiomarkerKey): string | null {
    if (!latest || !first || biomarkers.length < 2) return null;
    const l = getVal(latest, key);
    const f = getVal(first, key);
    if (l == null || f == null) return null;
    const delta = l - f;
    if (delta === 0) return null;
    const sign = delta > 0 ? "+" : "";
    return `${sign}${formatValue(key, delta)}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Biomarkers</p>
        <div className="flex gap-2">
          <button
            onClick={() => setShowConfig(true)}
            className="text-xs text-gray-400 hover:text-gray-700 font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors"
          >
            Configure
          </button>
          {tracked.length > 0 && (
            <button
              onClick={() => setShowLog(true)}
              className="text-xs font-semibold text-white bg-purple-600 hover:bg-purple-700 px-3 py-1.5 rounded-lg transition-colors"
            >
              + Log measurement
            </button>
          )}
        </div>
      </div>

      {tracked.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-200 p-8 text-center">
          <p className="text-gray-400 text-sm mb-3">No biomarkers configured</p>
          <button
            onClick={() => setShowConfig(true)}
            className="text-sm font-semibold text-purple-600 hover:text-purple-800"
          >
            Select markers to track →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tracked.map((key) => {
            const meta = BIOMARKERS[key];
            const latestVal = latest ? getVal(latest, key) : null;
            const delta = getDelta(key);
            const chartData = biomarkers
              .map((b) => ({ date: b.loggedAt, value: getVal(b, key) }))
              .filter((d) => d.value != null) as { date: string; value: number }[];

            return (
              <div key={key} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-xs font-medium text-gray-500">{meta.label}</p>
                    {latestVal != null ? (
                      <p className="text-2xl font-bold text-gray-900 mt-0.5">
                        {formatValue(key, latestVal)}
                      </p>
                    ) : (
                      <p className="text-2xl font-bold text-gray-300 mt-0.5">—</p>
                    )}
                  </div>
                  {delta && (
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                      isImprovement(key, parseFloat(delta))
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-600"
                    }`}>
                      {delta}
                    </span>
                  )}
                </div>
                {chartData.length >= 2 ? (
                  <BiomarkerChart data={chartData} color={meta.color} unit={meta.unit} />
                ) : (
                  <div className="h-20 flex items-center justify-center text-xs text-gray-300">
                    Log at least 2 measurements to see trend
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showConfig && (
        <ConfigModal
          clientId={clientId}
          current={tracked}
          onClose={() => setShowConfig(false)}
          onSaved={() => { setShowConfig(false); router.refresh(); }}
        />
      )}

      {showLog && (
        <LogModal
          clientId={clientId}
          heightCm={heightCm}
          tracked={tracked}
          onClose={() => setShowLog(false)}
          onSaved={() => { setShowLog(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

function getVal(log: BiomarkerLog, key: BiomarkerKey): number | null {
  const map: Record<BiomarkerKey, number | undefined> = {
    weight_kg: log.weightKg,
    bmi: log.bmi,
    waist_cm: log.waistCm,
    hip_cm: log.hipCm,
    waist_hip_ratio: log.waistHipRatio,
    body_fat_pct: log.bodyFatPct,
    neck_cm: log.neckCm,
    chest_cm: log.chestCm,
    bicep_cm: log.bicepCm,
    thigh_cm: log.thighCm,
  };
  return map[key] ?? null;
}

// Lower is better for weight/fat/waist markers; higher is better for muscle markers
function isImprovement(key: BiomarkerKey, delta: number): boolean {
  const lowerBetter: BiomarkerKey[] = ["weight_kg", "bmi", "waist_cm", "waist_hip_ratio", "body_fat_pct"];
  return lowerBetter.includes(key) ? delta < 0 : delta > 0;
}

function ConfigModal({ clientId, current, onClose, onSaved }: {
  clientId: string; current: BiomarkerKey[]; onClose: () => void; onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Set<BiomarkerKey>>(new Set(current));
  const [loading, setLoading] = useState(false);

  function toggle(key: BiomarkerKey) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  async function save() {
    setLoading(true);
    try {
      await updateTrackedBiomarkers(clientId, [...selected]);
      onSaved();
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="Configure biomarkers" onClose={onClose}>
      <p className="text-sm text-gray-500 mb-5">Choose which measurements to track for this client.</p>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {BIOMARKER_KEYS.map((key) => {
          const meta = BIOMARKERS[key];
          const on = selected.has(key);
          const derived = DERIVED_MARKERS.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-left transition-colors ${
                on ? "border-purple-400 bg-purple-50" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                on ? "bg-purple-600 border-purple-600" : "border-gray-300"
              }`}>
                {on && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </span>
              <div>
                <p className={`text-sm font-medium ${on ? "text-purple-900" : "text-gray-700"}`}>{meta.label}</p>
                {meta.unit && <p className="text-xs text-gray-400">{meta.unit}{derived ? " · auto" : ""}</p>}
              </div>
            </button>
          );
        })}
      </div>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-medium rounded-xl py-3 text-sm hover:bg-gray-50 transition-colors">
          Cancel
        </button>
        <button onClick={save} disabled={loading} className="flex-1 bg-purple-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors">
          {loading ? "Saving…" : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

function LogModal({ clientId, heightCm, tracked, onClose, onSaved }: {
  clientId: string; heightCm?: number; tracked: BiomarkerKey[];
  onClose: () => void; onSaved: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [vals, setVals] = useState<Partial<Record<BiomarkerKey, string>>>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputMarkers = tracked.filter((k) => !DERIVED_MARKERS.includes(k));

  // Auto-calculate BMI if weight is entered and height is known
  const weight = parseFloat(vals.weight_kg ?? "");
  const autoBmi = !isNaN(weight) && heightCm
    ? parseFloat((weight / Math.pow(heightCm / 100, 2)).toFixed(1))
    : null;

  async function save() {
    setError(null);
    setLoading(true);
    try {
      await logBiomarker(clientId, {
        loggedAt: date,
        weightKg: vals.weight_kg ? parseFloat(vals.weight_kg) : undefined,
        bmi: tracked.includes("bmi") ? (vals.bmi ? parseFloat(vals.bmi) : autoBmi ?? undefined) : undefined,
        waistCm: vals.waist_cm ? parseFloat(vals.waist_cm) : undefined,
        hipCm: vals.hip_cm ? parseFloat(vals.hip_cm) : undefined,
        bodyFatPct: vals.body_fat_pct ? parseFloat(vals.body_fat_pct) : undefined,
        neckCm: vals.neck_cm ? parseFloat(vals.neck_cm) : undefined,
        chestCm: vals.chest_cm ? parseFloat(vals.chest_cm) : undefined,
        bicepCm: vals.bicep_cm ? parseFloat(vals.bicep_cm) : undefined,
        thighCm: vals.thigh_cm ? parseFloat(vals.thigh_cm) : undefined,
        notes: notes || undefined,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalShell title="Log measurement" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className={input} />
        </div>

        {inputMarkers.map((key) => {
          const meta = BIOMARKERS[key];
          const isBmiDerived = key === "bmi" && autoBmi !== null;
          return (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {meta.label}{meta.unit ? ` (${meta.unit})` : ""}
                {isBmiDerived && <span className="text-xs text-purple-500 ml-2">auto: {autoBmi}</span>}
              </label>
              <input
                type="number"
                step="0.1"
                value={isBmiDerived ? (vals.bmi ?? String(autoBmi)) : (vals[key] ?? "")}
                onChange={(e) => setVals((v) => ({ ...v, [key]: e.target.value }))}
                placeholder={isBmiDerived ? String(autoBmi ?? "") : `e.g. ${key === "body_fat_pct" ? "18" : key.includes("kg") ? "72" : "80"}`}
                className={input}
              />
            </div>
          );
        })}

        {tracked.includes("waist_hip_ratio") && (
          <div className="bg-gray-50 rounded-xl px-4 py-3 text-sm text-gray-500">
            Waist-hip ratio is calculated automatically from waist and hip measurements.
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Notes (optional)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            rows={2} placeholder="e.g. Measured after morning workout"
            className={`${input} resize-none`} />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-medium rounded-xl py-3 text-sm hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={save} disabled={loading} className="flex-1 bg-purple-600 text-white font-semibold rounded-xl py-3 text-sm hover:bg-purple-700 disabled:opacity-50 transition-colors">
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

const input = "w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition";
