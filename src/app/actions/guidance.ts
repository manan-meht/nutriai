"use server";

import { createServiceClient } from "@/lib/supabase/server";
import {
  adjustTargets,
  confirmActivation,
  proposeActivation,
  returnToTracking,
  type AdjustResult,
  type ConfirmResult,
  type DeactivateResult,
  type ProposalResult,
} from "@/lib/guidance/activation";
import { resolveGuidanceActor, type GuidanceSurface } from "@/lib/guidance/request-actor";
import { parseSetupAnswers } from "@/lib/guidance/setup-answers";

// The Guidance setup flow's three writes. Each one resolves the actor from
// the request's own credential and hands it to activation.ts, which checks
// permission and the release gate again on every call — so these stay thin
// on purpose. Anything that decides who may do what belongs in
// authorization.ts, where it is tested on its own.
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

/** Screens and computes, and shows the result. Switches nothing on. */
export async function proposeGuidanceAction(
  surface: GuidanceSurface,
  contactId: string,
  answers: unknown
): Promise<ProposalResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  return proposeActivation(createServiceClient(), { contactId, ...request, answers: parseSetupAnswers(answers) });
}

/** Switches Guidance on. Takes the answers again, never the proposal: the
 * targets are recomputed from them on the server, so the numbers shown at
 * the review step cannot come back altered. */
export async function confirmGuidanceAction(
  surface: GuidanceSurface,
  contactId: string,
  answers: unknown
): Promise<ConfirmResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  return confirmActivation(createServiceClient(), { contactId, ...request, answers: parseSetupAnswers(answers) });
}

export async function returnToTrackingAction(surface: GuidanceSurface, contactId: string): Promise<DeactivateResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  return returnToTracking(createServiceClient(), { contactId, ...request });
}

/** A coach sets the client's targets by hand. The numbers arrive from the
 * browser untyped; anything that isn't a number becomes NaN here and fails
 * adjustTargets' bounds check with a message naming the field. */
export async function adjustTargetsAction(
  surface: GuidanceSurface,
  contactId: string,
  targets: unknown,
  note: unknown
): Promise<AdjustResult> {
  const request = await resolveGuidanceActor(surface);
  if (!request || typeof contactId !== "string") return NOT_SIGNED_IN;
  const raw = (targets && typeof targets === "object" ? targets : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : Number.NaN);
  return adjustTargets(createServiceClient(), {
    contactId,
    ...request,
    targets: {
      caloriesKcal: num(raw.caloriesKcal),
      proteinG: num(raw.proteinG),
      carbsG: num(raw.carbsG),
      fatG: num(raw.fatG),
      fiberG: num(raw.fiberG),
    },
    note: typeof note === "string" ? note : null,
  });
}
