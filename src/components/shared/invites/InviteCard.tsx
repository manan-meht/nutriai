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
  /** Overrides the default "waiting for them to message on WhatsApp" —
   * wrong pronoun for the self-tracking flow, where the invite is for the
   * caregiver's own account, not a third party. */
  pendingLabel?: string;
  /** Persists that the caregiver/coach actually clicked "Send invite on
   * WhatsApp" or "Copy invite link" (see markInviteLinkOpened) — without
   * this, a pending invite that was already sent looks identical to one
   * that was just auto-generated and never sent, on every later visit. */
  onLinkOpened?: () => Promise<unknown>;
}

export function InviteCard({ title, description, load, regenerate, revoke, onChange, pendingLabel, onLinkOpened }: InviteCardProps) {
  const [invite, setInvite] = useState<InviteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // Once an already-sent invite is shown, "Resend" is tucked behind this
  // toggle rather than shown by default — see the render logic below.
  const [showResend, setShowResend] = useState(false);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((result) => {
        if (cancelled) return;
        setLoading(false);
        if ("error" in result) setError(result.error);
        else {
          setInvite(result);
          onChange?.(result);
        }
      })
      .catch((err) => {
        // Without this, a rejected server action (e.g. a missing env var,
        // a transient DB error) left this card stuck on "Loading invite…"
        // forever with no feedback — .then() alone doesn't catch rejections.
        if (cancelled) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "Couldn't load invite.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load/onChange are stable per mount for this card's target
  }, []);

  async function handleRegenerate() {
    setBusy(true);
    try {
      const result = await regenerate();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setInvite(result);
      setError(null);
      setShowResend(false);
      onChange?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't regenerate invite.");
    } finally {
      setBusy(false);
    }
  }

  /** Optimistic — the actual persistence happens server-side via
   * onLinkOpened, but the UI shouldn't wait on that round trip to reflect
   * "sent" (nor block/hide the WhatsApp navigation or clipboard write on
   * it succeeding). */
  function markOpenedLocally() {
    if (!invite || invite.linkOpenedAt) return;
    setInvite({ ...invite, linkOpenedAt: new Date().toISOString() });
    onLinkOpened?.().catch(() => {});
  }

  async function handleRevoke() {
    if (!revoke) return;
    if (!confirm("Revoke this invite? The link will stop working.")) return;
    setBusy(true);
    try {
      const result = await revoke();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (invite) setInvite({ ...invite, status: "revoked" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't revoke invite.");
    } finally {
      setBusy(false);
    }
  }

  function handleCopy() {
    if (!invite) return;
    // Copy the full explainer message (what shareLink pre-fills), not just
    // the bare link — whoever pastes this should get the same "here's what
    // Tistra Health is" context as the WhatsApp share button gives. Falls
    // back to the bot link itself for "self" invites, which have no
    // separate shareMessage since there's no inviter/invitee split.
    const toCopy = invite.shareMessage ?? invite.link;
    navigator.clipboard.writeText(toCopy);
    trackInviteEvent("invite_copied", { link: invite.link });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    markOpenedLocally();
  }

  function handleOpenWhatsApp() {
    if (!invite) return;
    trackInviteEvent("invite_link_opened", { link: invite.shareLink ?? invite.link });
    markOpenedLocally();
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
          {(() => {
            const expired = new Date(invite.expiresAt) < new Date();
            const alreadySent = !!invite.linkOpenedAt && !expired;
            return (
              <div className={`rounded-xl p-3 ${expired ? "bg-[var(--color-status-support-bg)]" : alreadySent ? "bg-[var(--color-status-good-bg)]" : "bg-[var(--color-status-steady-bg)]"}`}>
                <p className={`text-sm font-medium ${alreadySent ? "text-[var(--color-status-good-text)]" : "text-gray-700"}`}>
                  {expired
                    ? "This invite has expired."
                    : alreadySent
                      ? "✓ Invite sent — no action needed unless they didn't receive it."
                      : (pendingLabel ?? "Pending — waiting for them to message on WhatsApp.")}
                </p>
                <p className={`text-xs mt-0.5 ${alreadySent ? "text-[var(--color-status-good-text)] opacity-80" : "text-gray-500"}`}>
                  Expires {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              </div>
            );
          })()}

          {new Date(invite.expiresAt) >= new Date() && invite.linkOpenedAt && !showResend && (
            <button
              onClick={() => setShowResend(true)}
              className="text-xs font-medium text-gray-500 hover:text-gray-700 underline"
            >
              Didn&apos;t receive it? Resend
            </button>
          )}

          {new Date(invite.expiresAt) >= new Date() && (!invite.linkOpenedAt || showResend) && (
            <div className="flex flex-wrap gap-2">
              <a
                href={invite.shareLink ?? invite.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleOpenWhatsApp}
                className="bg-[var(--color-dashboard-primary)] text-white text-sm font-medium rounded-lg px-4 py-2"
              >
                {invite.shareLink ? "Send invite on WhatsApp" : "Message the bot on WhatsApp"}
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
