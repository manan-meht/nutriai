import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getClients as getClientsCore,
  getClientDetails as getClientDetailsCore,
  getOrCreateWorkspace as getOrCreateWorkspaceCore,
} from "@nutriai/nutrition-core";
import { createServiceClient } from "./supabase";

// Mirrors the main app's src/app/(gym)/gym/dashboard/actions.ts read paths
// via the shared @nutriai/nutrition-core package (see
// packages/nutrition-core and this app's README) rather than duplicating
// them — write actions (add/remove/invite/goals) stay exclusively in the
// main app.

export async function getOrCreateWorkspace(userId: string, coachName?: string) {
  const admin = createServiceClient();
  return getOrCreateWorkspaceCore(admin, userId, "gym", coachName);
}

export async function getClients(workspaceId: string, supabase: SupabaseClient) {
  return getClientsCore(workspaceId, supabase);
}

// 30-day window matches the main app's gym dashboard — see
// packages/nutrition-core/src/gym.ts.
const CLIENT_DETAILS_SINCE_DAYS = 30;

export async function getClientDetails(clientId: string, supabase: SupabaseClient) {
  const admin = createServiceClient();
  return getClientDetailsCore(clientId, supabase, admin, CLIENT_DETAILS_SINCE_DAYS);
}
