"use client";

/** Thin amber action strip shown inside a FamilyHealthCard when WhatsApp
 * meal reminders have stopped — either "reopen WhatsApp" (accepted an
 * invite before, gone quiet past the 24h customer-service window) or the
 * plain "not connected yet" case. Deliberately compact (see the family-
 * dashboard-redesign spec: the old ContactCard's equivalent banners were
 * full-width call-out boxes that dominated the card). Stops click
 * propagation so the button doesn't trigger the card's own onOpen nav. */
export function ReminderStatus({
  title,
  description,
  waLink,
}: {
  title: string;
  description: string;
  /** wa.me link, or undefined if TISTRA_WHATSAPP_NUMBER isn't configured
   * (in which case the strip still shows, just without the button). */
  waLink?: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-base shrink-0" aria-hidden="true">📲</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300 truncate">{title}</p>
        <p className="text-[11px] text-amber-700/80 dark:text-amber-400/70 truncate">{description}</p>
      </div>
      {waLink && (
        <a
          href={waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-semibold text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 rounded-lg px-2.5 py-1.5 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
        >
          Open WhatsApp
        </a>
      )}
    </div>
  );
}
