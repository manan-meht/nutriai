"use client";

import { useEffect, useState } from "react";
import type { InviteSummary } from "@/lib/invites/types";
import { trackInviteEvent } from "@/lib/invites/analytics";

type InviteResult = InviteSummary | { error: string };

export interface InviteCardProps {
  title: string;
  description: string;
  /** Fetches (or lazily creates) the current invite for this target. */
  load: () => Promise<InviteResult>;
  regenerate: () => Promise<InviteResult>;
  /** Family/coach_client only — self invites can't be revoked since
   * there's no profile to disconnect until claimed. */
  revoke?: () => Promise<{ ok: true } | { error: string }>;
  onChange?: (invite: InviteSummary) => void;
}

export function InviteCard({ title, description, load, regenerate, revoke, onChange }: InviteCardProps) {
  const [invite, setInvite] = useState<InviteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load().then((result) => {
      if (cancelled) return;
      setLoading(false);
      if ("error" in result) setError(result.error);
      else {
        setInvite(result);
        onChange?.(result);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load/onChange are stable per mount for this card's target
  }, []);

  async function handleRegenerate() {
    setBusy(true);
    const result = await regenerate();
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setInvite(result);
    setError(null);
    onChange?.(result);
  }

  async function handleRevoke() {
    if (!revoke) return;
    if (!confirm("Revoke this invite? The link will stop working.")) return;
    setBusy(true);
    const result = await revoke();
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    if (invite) setInvite({ ...invite, status: "revoked" });
  }

  function handleCopy() {
    if (!invite) return;
    navigator.clipboard.writeText(invite.link);
    trackInviteEvent("invite_copied", { link: invite.link });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleOpenWhatsApp() {
    if (!invite) return;
    trackInviteEvent("invite_link_opened", { link: invite.link });
  }

  if (loading) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-gray-400">Loading invite…</div>;
  }
  if (error || !invite) {
    return <div className="bg-white rounded-2xl border border-gray-100 p-4 text-sm text-[var(--color-status-support-text)]">{error ?? "Couldn't load invite."}</div>;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      <div>
        <p className="font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      {invite.status === "claimed" ? (
        <div className="bg-[var(--color-status-good-bg)] rounded-xl p-3 space-y-1">
          <p className="text-sm font-medium text-[var(--color-status-good-text)]">Connected — Active</p>
          {invite.claimedByWhatsappNumberMasked && (
            <p className="text-xs text-[var(--color-status-good-text)] opacity-80">WhatsApp: {invite.claimedByWhatsappNumberMasked}</p>
          )}
          {invite.claimedAt && (
            <p className="text-xs text-[var(--color-status-good-text)] opacity-80">
              Connected {new Date(invite.claimedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      ) : invite.status === "revoked" ? (
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-sm text-gray-500">This invite was revoked.</p>
        </div>
      ) : (
        <>
          <div className={`rounded-xl p-3 ${new Date(invite.expiresAt) < new Date() ? "bg-[var(--color-status-support-bg)]" : "bg-[var(--color-status-steady-bg)]"}`}>
            <p className="text-sm font-medium text-gray-700">
              {new Date(invite.expiresAt) < new Date() ? "This invite has expired." : "Pending — waiting for them to message on WhatsApp."}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Expires {new Date(invite.expiresAt).toLocaleDateString()}</p>
          </div>

          {new Date(invite.expiresAt) >= new Date() && (
            <div className="flex flex-wrap gap-2">
              <a
                href={invite.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleOpenWhatsApp}
                className="bg-[var(--color-dashboard-primary)] text-white text-sm font-medium rounded-lg px-4 py-2"
              >
                Send invite on WhatsApp
              </a>
              <button onClick={handleCopy} className="border border-gray-200 text-gray-700 text-sm font-medium rounded-lg px-4 py-2">
                {copied ? "Copied!" : "Copy invite link"}
              </button>
            </div>
          )}
        </>
      )}

      <div className="flex gap-3 pt-1">
        <button onClick={handleRegenerate} disabled={busy} className="text-xs font-medium text-[var(--color-dashboard-primary)] underline disabled:opacity-50">
          Regenerate
        </button>
        {revoke && invite.status === "pending" && (
          <button onClick={handleRevoke} disabled={busy} className="text-xs font-medium text-[var(--color-status-support-text)] underline disabled:opacity-50">
            Revoke
          </button>
        )}
      </div>
    </div>
  );
}
