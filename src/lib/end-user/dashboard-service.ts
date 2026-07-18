import { createClient } from "@supabase/supabase-js";
import type { ContactType } from "@/lib/end-user/otp";
import { fetchHumanCorrectionsByMealLogId } from "@/lib/nutrition/fetch-human-corrections";
import type { ProfileDashboardData } from "@/lib/dashboard/profile-dashboard-types";
import {
  getEndUserDashboardData,
  getAccessList,
  setSharingPaused as setSharingPausedCore,
  requestRemoval as requestRemovalCore,
  isSharingPaused,
  hasAcceptedConsent as hasAcceptedConsentCore,
  acceptConsent as acceptConsentCore,
  getInviter as getInviterCore,
  type EndUserAccessEntry,
  type Inviter,
} from "@nutriai/end-user-core";

export type { Inviter };

export type { EndUserAccessEntry };

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface EndUserDashboard {
  contactId: string;
  contactType: ContactType;
  /** Full profile + meal history, shaped for the shared ProfileDashboard
   * component (see src/components/dashboard/ProfileDashboard.tsx) — same
   * data shape the family_admin/coach dashboards render, just fetched via
   * the OTP-authenticated end-user session instead of an owner check. */
  data: ProfileDashboardData;
  accessList: EndUserAccessEntry[];
  isPaused: boolean;
}

/** Thin wrapper over @nutriai/end-user-core's getEndUserDashboardData —
 * the shared function returns meals without humanCorrection attached
 * (that enrichment depends on this app's Meal Review Console tables, which
 * the shared package doesn't know about), so this layer fetches corrections
 * and merges them in before handing the result to ProfileDashboard. */
export async function getEndUserDashboard(contactId: string, contactType: ContactType): Promise<EndUserDashboard> {
  const db = admin();
  const [{ profile, meals }, accessList, isPaused] = await Promise.all([
    getEndUserDashboardData(db, contactId, contactType),
    getAccessList(db, contactId, contactType),
    isSharingPaused(db, contactId),
  ]);

  const corrections = await fetchHumanCorrectionsByMealLogId(meals.map((m) => m.id));
  const mealsWithCorrections: ProfileDashboardData["meals"] = meals.map((m) => ({
    ...m,
    humanCorrection: corrections[m.id],
  }));

  return {
    contactId,
    contactType,
    data: { profile, meals: mealsWithCorrections },
    accessList,
    isPaused,
  };
}

export async function setSharingPaused(contactId: string, contactType: ContactType, paused: boolean): Promise<void> {
  await setSharingPausedCore(admin(), contactId, contactType, paused);
}

export async function requestRemoval(contactId: string, contactType: ContactType): Promise<void> {
  await requestRemovalCore(admin(), contactId, contactType);
}

/** Whether this contact has accepted the consent screen at least once —
 * gates dashboard access after Temporary Access Code / OTP verification
 * (shown inline on /my-progress/dashboard when needed). */
export async function hasAcceptedConsent(contactId: string): Promise<boolean> {
  return hasAcceptedConsentCore(admin(), contactId);
}

export async function acceptConsent(contactId: string, contactType: ContactType): Promise<void> {
  await acceptConsentCore(admin(), contactId, contactType);
}

export async function getInviter(contactId: string, contactType: ContactType): Promise<Inviter | null> {
  return getInviterCore(admin(), contactId, contactType);
}
