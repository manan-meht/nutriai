import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getContacts as getContactsCore,
  getContactDetails as getContactDetailsCore,
  getOrCreateWorkspace,
} from "@nutriai/nutrition-core";
import { createServiceClient } from "./supabase";

// Mirrors the main app's src/app/(adults)/adults/dashboard/actions.ts read
// paths via the shared @nutriai/nutrition-core package (see
// packages/nutrition-core and this app's README) rather than duplicating
// them — write actions (add/remove/invite/goals) stay exclusively in the
// main app.

export async function getOrCreateAdultsWorkspace(userId: string, caregiverName?: string) {
  const admin = createServiceClient();
  return getOrCreateWorkspace(admin, userId, "adults", caregiverName);
}

export async function getContacts(workspaceId: string, supabase: SupabaseClient) {
  return getContactsCore(workspaceId, supabase);
}

// 400-day window matches the main app's date-range selector (up to "This
// year"/"All time") — see packages/nutrition-core/src/adults.ts.
const CONTACT_DETAILS_SINCE_DAYS = 400;

export async function getContactDetails(contactId: string, supabase: SupabaseClient) {
  const admin = createServiceClient();
  return getContactDetailsCore(contactId, supabase, admin, CONTACT_DETAILS_SINCE_DAYS);
}
