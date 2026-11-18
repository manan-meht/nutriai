"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import { summarizeDays } from "@/lib/guidance/aggregation";
import type { GuidanceActions } from "@/lib/guidance/bound-actions";
import type { GuidanceDashboard } from "@/lib/guidance/view";

import { GuidanceModeOnSwitch } from "./GuidanceModeSwitch";
import { GuidanceProgressTab } from "./GuidanceProgressTab";
import { GuidanceTodayTab } from "./GuidanceTodayTab";
import { primaryAction, type GuidanceViewer } from "./ui";

export type { GuidanceViewer } from "./ui";

// Guidance mode's whole screen: its own header (logo, Today and Progress
// tabs, the person's avatar) over the two tabs. It replaces the long
// tracking dashboard rather than sitting inside it.

type Tab = "today" | "progress";

export interface GuidancePerson {
  fullName: string;
  initials: string;
  photoUrl: string | null;
}

function AvatarMenu({
  person,
  manageHref,
  manageLabel,
  onEditDetails,
  onSignOut,
}: {
  person: GuidancePerson;
  manageHref?: string;
  manageLabel: string;
  onEditDetails?: () => void;
  onSignOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const avatar = person.photoUrl ? (
    <span className="relative block h-10 w-10 overflow-hidden rounded-full">
      <Image src={person.photoUrl} alt="" fill sizes="40px" className="object-cover" />
    </span>
  ) : (
    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--gm-accent)] text-sm font-bold text-[var(--gm-on-accent)]">
      {person.initials}
    </span>
  );

  if (!manageHref && !onEditDetails && !onSignOut) {
    return (
      <span title={person.fullName}>
        {avatar}
        <span className="sr-only">{person.fullName}</span>
      </span>
    );
  }

  const item =
    "block w-full rounded-lg px-3 py-2 text-left text-sm text-[var(--gm-text)] hover:bg-[var(--gm-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]";
  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--gm-page)]"
      >
        {avatar}
        <span className="sr-only">{person.fullName}: profile and settings</span>
      </button>
      {open && (
        <div
          id={menuId}
          className="absolute right-0 top-12 z-20 w-60 rounded-xl border border-[var(--gm-border-strong)] bg-[var(--gm-card)] p-2 shadow-2xl"
        >
          <p className="px-3 py-2 text-sm font-semibold text-[var(--gm-text)]">{person.fullName}</p>
          {onEditDetails && (
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                onEditDetails();
              }}
            >
              Edit details
            </button>
          )}
          {manageHref && (
            <Link href={manageHref} className={item}>
              {manageLabel}
            </Link>
          )}
          {onSignOut && (
            <button type="button" className={item} onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function GuidanceScreen({
  guidance,
  viewer,
  person,
  backHref,
  manageHref,
  onEditDetails,
  notice,
  actions,
  onSignOut,
  canTurnOff = false,
}: {
  guidance: GuidanceDashboard;
  viewer: GuidanceViewer;
  person: GuidancePerson;
  backHref?: string;
  /** The Guidance screen: targets, and Return to Tracking where allowed. */
  manageHref?: string;
  onEditDetails?: () => void;
  /** Shown above the tabs' content, e.g. the WhatsApp invite. */
  notice?: ReactNode;
  /** Plan, skip and habit actions, bound to this person on the server.
   * Absent for a read-only view. */
  actions?: GuidanceActions;
  onSignOut?: () => void;
  /** Whether this viewer may switch Guidance off (never for a coach
   * client, who has Guidance only). */
  canTurnOff?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("today");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ today: null, progress: null });
  const id = useId();
  const summaries = summarizeDays(guidance.history, guidance.date, guidance.expectedMealsPerDay, guidance.skips);
  const firstName = person.fullName.split(" ")[0];
  const canLog = viewer.kind === "self" && !!guidance.logMealHref;

  function onTabKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Tab = tab === "today" ? "progress" : "today";
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  function showHistory() {
    setTab("progress");
    setDetailsOpen(true);
    // After the Progress panel renders.
    requestAnimationFrame(() => document.getElementById("guidance-daily-details")?.scrollIntoView({ block: "start" }));
  }

  return (
    <div className="guidance-theme min-h-screen bg-[var(--gm-page)] text-[var(--gm-text)]">
      <header className="sticky top-0 z-10 border-b border-[var(--gm-border)] bg-[var(--gm-page)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 px-4 sm:flex-nowrap sm:px-6">
          {backHref && (
            <Link
              href={backHref}
              aria-label="Back"
              className="-ml-1 rounded-lg p-1 text-[var(--gm-text-secondary)] hover:text-[var(--gm-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
            >
              <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
          )}
          <span className="flex h-16 items-center gap-2.5 sm:w-48">
            <Image src="/logos/logo-purple.png" alt="" width={30} height={30} className="h-[30px] w-[30px] object-contain" />
            <span className="text-lg font-semibold tracking-tight text-[var(--gm-text)]">Tistra Health</span>
          </span>

          <div
            role="tablist"
            aria-label={`${viewer.kind === "self" ? "Your" : `${viewer.name}'s`} nutrition`}
            className="order-last grid w-full grid-cols-2 sm:order-none sm:flex sm:w-auto sm:flex-1 sm:justify-center sm:gap-8"
          >
            {(["today", "progress"] as const).map((t) => (
              <button
                key={t}
                ref={(el) => {
                  tabRefs.current[t] = el;
                }}
                id={`${id}-tab-${t}`}
                role="tab"
                type="button"
                aria-selected={tab === t}
                aria-controls={`${id}-panel`}
                tabIndex={tab === t ? 0 : -1}
                onClick={() => setTab(t)}
                onKeyDown={onTabKey}
                className={`border-b-[3px] px-4 pb-3 pt-2 text-base font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--gm-accent)] sm:pb-5 sm:pt-5 sm:text-lg ${
                  tab === t
                    ? "border-[var(--gm-accent)] font-semibold text-[var(--gm-text)]"
                    : "border-transparent text-[var(--gm-text-secondary)] hover:text-[var(--gm-text)]"
                }`}
              >
                {t === "today" ? "Today" : "Progress"}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center justify-end gap-4 sm:ml-0 sm:w-48">
            <GuidanceModeOnSwitch
              onTurnOff={canTurnOff ? actions?.turnOff : undefined}
              personName={viewer.kind === "self" ? undefined : viewer.name}
            />
            <AvatarMenu
              person={person}
              manageHref={manageHref}
              manageLabel={viewer.kind === "coach" ? "Targets and Guidance" : "Guidance settings"}
              onEditDetails={onEditDetails}
              onSignOut={onSignOut}
            />
          </div>
        </div>
      </header>

      <main className={`mx-auto max-w-5xl px-4 pt-6 sm:px-6 sm:pb-12 sm:pt-10 ${canLog ? "pb-28" : "pb-12"}`}>
        {/* Always shown: Guidance mode is a beta, whatever the environment. */}
        <p
          role="note"
          className="mb-6 rounded-xl border border-[var(--gm-over-border)] bg-[var(--gm-over-soft)] px-4 py-2.5 text-sm text-[var(--gm-over-text)]"
        >
          <strong className="font-semibold">Beta.</strong> Guidance mode is new and still being tested
          {guidance.isPreviewOnly ? ", and its targets haven't been checked by a health professional yet" : ""}. Estimates come from
          meal photos.
        </p>
        {notice && <div className="mb-6">{notice}</div>}
        <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`}>
          {tab === "today" ? (
            <GuidanceTodayTab
              guidance={guidance}
              viewer={viewer}
              firstName={firstName}
              onShowHistory={showHistory}
              actions={actions}
            />
          ) : (
            <GuidanceProgressTab
              guidance={guidance}
              viewer={viewer}
              summaries={summaries}
              detailsOpen={detailsOpen}
              onDetailsToggle={setDetailsOpen}
              actions={actions}
            />
          )}
        </div>
      </main>

      {/* On a phone, logging is the one always-reachable action. */}
      {canLog && tab === "today" && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--gm-border)] bg-[var(--gm-page)] px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:hidden">
          <a href={guidance.logMealHref!} target="_blank" rel="noopener noreferrer" className={`w-full py-3 text-base ${primaryAction}`}>
            <span aria-hidden="true">+</span> Log a meal
          </a>
        </div>
      )}
    </div>
  );
}

/** Where the Guidance view goes, before it exists: for a coach client, who
 * only has Guidance, setting it up is the first thing to do, not a card at
 * the bottom of the page. */
export function GuidanceSetupPrompt({ href, personName }: { href: string; personName: string }) {
  return (
    <section className="guidance-theme rounded-2xl bg-[var(--gm-page)] p-5 text-[var(--gm-text)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--gm-text)]">Set up {personName}&apos;s daily targets</h2>
          <p className="mt-1 text-sm text-[var(--gm-text-secondary)]">
            A few health questions, then recommended calorie and macro targets you can fine-tune.
          </p>
        </div>
        <Link href={href} className={`shrink-0 text-center ${primaryAction}`}>
          Set up targets →
        </Link>
      </div>
    </section>
  );
}
