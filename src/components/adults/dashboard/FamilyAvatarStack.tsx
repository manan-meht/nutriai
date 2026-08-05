"use client";

import { ContactAvatar } from "@/components/shared/dashboard/ContactAvatar";

interface StackPerson {
  id: string;
  fullName: string;
  photoUrl?: string;
}

/** Overlapping avatar row for the family summary strip's left side — plus
 * a trailing "+" button to add another person, shown only when the
 * account can actually add one (see canAdd in AdultsDashboardClient). */
export function FamilyAvatarStack({ people, onAdd }: { people: StackPerson[]; onAdd?: () => void }) {
  return (
    <div className="flex items-center -space-x-2.5 shrink-0">
      {people.slice(0, 4).map((p) => (
        <div key={p.id} className="ring-2 ring-white dark:ring-[var(--color-dashboard-dark-card)] rounded-full">
          <ContactAvatar photoUrl={p.photoUrl} fullName={p.fullName} size="md" />
        </div>
      ))}
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add family member"
          className="w-11 h-11 rounded-full bg-[var(--color-dashboard-primary)] text-white flex items-center justify-center text-xl font-semibold ring-2 ring-white dark:ring-[var(--color-dashboard-dark-card)] hover:bg-[var(--color-dashboard-primary-hover)] transition-colors"
        >
          +
        </button>
      )}
    </div>
  );
}
