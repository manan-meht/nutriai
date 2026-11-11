"use server";

import { createServiceClient } from "@/lib/supabase/server";
import type { AdjustResult, ConfirmResult, DeactivateResult, ProposalResult } from "@/lib/guidance/activation";
import type { DailyActionResult } from "@/lib/guidance/day-plan";
import type { HabitActionResult } from "@/lib/guidance/habits";
import { resolveGuidanceActor, type GuidanceSurface } from "@/lib/guidance/request-actor";
import {
  addSupplementRequest,
  adjustTargetsRequest,
  answerClarificationRequest,
  cancelPlanRequest,
  chooseHabitRequest,
  confirmGuidanceRequest,
  confirmPlannedMealRequest,
  planMealRequest,
  proposeGuidanceRequest,
  returnToTrackingRequest,
  setMealSkippedRequest,
  setSupplementTakenRequest,
  stopSupplementRequest,
} from "@/lib/guidance/requests";

// The web's front door to Guidance: each server action finds the caller from
// the session cookie (request-actor.ts), then hands over to
// lib/guidance/requests.ts, which the mobile app's JSON API shares. The
// services under that check permission, the release gate and that Guidance
// is on, on every call, so these stay thin on purpose.
//
// The service client is needed because every Guidance table is RLS-locked
// with no policies (migration 0068): the screening answers in particular
// must not be selectable through a caregiver's own session.

const NOT_SIGNED_IN = {
  ok: false,
  kind: "forbidden",
  reason: "not_signed_in",
  message: "Your session has ended. Please sign in again.",
} as const;

/** Resolves the caller, or says they're not signed in. */
async function withRequest<T>(
  surface: GuidanceSurface,
  run: (db: ReturnType<typeof createServiceClient>, request: NonNullable<Awaited<ReturnType<typeof resolveGuidanceActor>>>) => Promise<T>
): Promise<T | typeof NOT_SIGNED_IN> {
  const request = await resolveGuidanceActor(surface);
  if (!request) return NOT_SIGNED_IN;
  return run(createServiceClient(), request);
}

/** Screens and computes, and shows the result. Switches nothing on. */
export async function proposeGuidanceAction(surface: GuidanceSurface, contactId: string, answers: unknown): Promise<ProposalResult> {
  return withRequest(surface, (db, r) => proposeGuidanceRequest(db, r, contactId, answers));
}

/** Switches Guidance on. Takes the answers again, never the proposal: the
 * targets are recomputed from them on the server, so the numbers shown at
 * the review step cannot come back altered. */
export async function confirmGuidanceAction(surface: GuidanceSurface, contactId: string, answers: unknown): Promise<ConfirmResult> {
  return withRequest(surface, (db, r) => confirmGuidanceRequest(db, r, contactId, answers));
}

export async function returnToTrackingAction(surface: GuidanceSurface, contactId: string): Promise<DeactivateResult> {
  return withRequest(surface, (db, r) => returnToTrackingRequest(db, r, contactId));
}

/** A coach sets the client's targets by hand. */
export async function adjustTargetsAction(surface: GuidanceSurface, contactId: string, targets: unknown, note: unknown): Promise<AdjustResult> {
  return withRequest(surface, (db, r) => adjustTargetsRequest(db, r, contactId, targets, note));
}

/** Plans one of the options on screen, by id; the server recomputes it. */
export async function planMealAction(surface: GuidanceSurface, contactId: string, optionId: unknown): Promise<DailyActionResult<{ planId: string }>> {
  return withRequest(surface, (db, r) => planMealRequest(db, r, contactId, optionId));
}

export async function cancelPlanAction(surface: GuidanceSurface, contactId: string, planId: unknown): Promise<DailyActionResult> {
  return withRequest(surface, (db, r) => cancelPlanRequest(db, r, contactId, planId));
}

/** "I had this": logs the planned meal from its planned portions. */
export async function confirmPlannedMealAction(
  surface: GuidanceSurface,
  contactId: string,
  planId: unknown
): Promise<DailyActionResult<{ mealLogId: string }>> {
  return withRequest(surface, (db, r) => confirmPlannedMealRequest(db, r, contactId, planId));
}

export async function setMealSkippedAction(surface: GuidanceSurface, contactId: string, input: unknown): Promise<DailyActionResult> {
  return withRequest(surface, (db, r) => setMealSkippedRequest(db, r, contactId, input));
}

/** Chooses this week's habit, or keeps this week's for next week. */
export async function chooseHabitAction(surface: GuidanceSurface, contactId: string, input: unknown): Promise<HabitActionResult> {
  return withRequest(surface, (db, r) => chooseHabitRequest(db, r, contactId, input));
}

/** A clarifying question's answer: household yes/no/not sure, or a brand. */
export async function answerClarificationAction(surface: GuidanceSurface, contactId: string, input: unknown): Promise<DailyActionResult> {
  return withRequest(surface, (db, r) => answerClarificationRequest(db, r, contactId, input));
}

export async function addSupplementAction(
  surface: GuidanceSurface,
  contactId: string,
  input: unknown
): Promise<DailyActionResult<{ scheduleId: string }>> {
  return withRequest(surface, (db, r) => addSupplementRequest(db, r, contactId, input));
}

export async function setSupplementTakenAction(surface: GuidanceSurface, contactId: string, input: unknown): Promise<DailyActionResult> {
  return withRequest(surface, (db, r) => setSupplementTakenRequest(db, r, contactId, input));
}

export async function stopSupplementAction(surface: GuidanceSurface, contactId: string, scheduleId: unknown): Promise<DailyActionResult> {
  return withRequest(surface, (db, r) => stopSupplementRequest(db, r, contactId, scheduleId));
}
