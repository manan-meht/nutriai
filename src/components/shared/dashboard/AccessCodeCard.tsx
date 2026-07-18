"use client";

import { useState } from "react";

interface AccessCodeResult {
  code: string;
  formattedCode: string;
  expiresAt: string;
  error?: undefined;
}
type ActionResult = AccessCodeResult | { error: string };

interface AccessCodeCardProps {
  personName: string;
  /** WhatsApp message text prefilled into the "Copy WhatsApp message"
   * button — includes the code, so this is only ever built client-side
   * right after generation, never persisted. */
  buildWhatsAppMessage: (formattedCode: string) => string;
  onGenerate: (ttlHours: 1 | 24) => Promise<ActionResult>;
  onRegenerate: (ttlHours: 1 | 24) => Promise<ActionResult>;
  onRevoke: () => Promise<{ ok: boolean }>;
}

/** "Generate access code" — shared by the adults and gym dashboards (see
 * ContactDashboard/ClientDashboard) rather than two copies, same pattern
 * as NutritionGoalFields/DietaryPreferencesFields. The plaintext code is
 * only ever held in this component's own state, shown once, and never
 * sent anywhere except the copy-to-clipboard/WhatsApp-message actions the
 * person explicitly clicks — never logged (see the server actions this
 * calls, which only ever return it once at generation time). */
export function AccessCodeCard({ personName, buildWhatsAppMessage, onGenerate, onRegenerate, onRevoke }: AccessCodeCardProps) {
  const [result, setResult] = useState<AccessCodeResult | null>(null);
  const [ttlHours, setTtlHours] = useState<1 | 24>(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "message" | null>(null);

  async function run(action: (ttlHours: 1 | 24) => Promise<ActionResult>) {
    setLoading(true);
    setError(null);
    setCopied(null);
    const res = await action(ttlHours);
    setLoading(false);
    if (!("code" in res)) {
      setError(res.error);
      setResult(null);
      return;
    }
    setResult(res);
  }

  async function handleRevoke() {
    setLoading(true);
    await onRevoke();
    setLoading(false);
    setResult(null);
  }

  async function copyText(text: string, which: "code" | "message") {
    await navigator.clipboard.writeText(text);
    setCopied(which);
  }

  return (
    <div className="rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Generate access code</h3>
      <p className="text-sm text-gray-500 mb-4">
        Create a temporary code so {personName} can open their private Tistra Health dashboard.
      </p>

      {!result && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-xs text-gray-500">Expires in</label>
            <select
              value={ttlHours}
              onChange={(e) => setTtlHours(Number(e.target.value) as 1 | 24)}
              className="text-sm rounded-lg border border-gray-200 px-2 py-1.5"
            >
              <option value={24}>24 hours</option>
              <option value={1}>1 hour</option>
            </select>
          </div>
          <button
            onClick={() => run(onGenerate)}
            disabled={loading}
            className="w-full bg-[var(--color-dashboard-primary)] text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate access code"}
          </button>
        </>
      )}

      {result && (
        <div className="space-y-3">
          <div className="text-center">
            <p className="text-2xl font-bold tracking-widest text-gray-900">{result.formattedCode}</p>
            <p className="text-xs text-gray-400 mt-1">
              This code works once and expires {new Date(result.expiresAt).toLocaleString()}. Only share it with {personName}.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => copyText(result.code, "code")}
              className="rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {copied === "code" ? "Copied!" : "Copy code"}
            </button>
            <button
              onClick={() => copyText(buildWhatsAppMessage(result.formattedCode), "message")}
              className="rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {copied === "message" ? "Copied!" : "Copy WhatsApp message"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => run(onRegenerate)}
              disabled={loading}
              className="rounded-lg border border-gray-200 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Regenerate code
            </button>
            <button
              onClick={handleRevoke}
              disabled={loading}
              className="rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Revoke code
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
    </div>
  );
}
