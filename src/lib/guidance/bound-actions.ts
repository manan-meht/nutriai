import {
  addSupplementAction,
  answerClarificationAction,
  cancelPlanAction,
  returnToTrackingAction,
  chooseHabitAction,
  confirmPlannedMealAction,
  planMealAction,
  setMealSkippedAction,
  setSupplementTakenAction,
  stopSupplementAction,
} from "@/app/actions/guidance";

import type { GuidanceSurface } from "./request-actor";

// The Guidance screen's day-to-day actions, bound to one person and one
// surface on the server page, so the client component only ever holds
// server-action references, never the ids to forge a call for someone else
// (every action re-checks the caller anyway).

export function guidanceActionsFor(surface: GuidanceSurface, contactId: string) {
  return {
    planMeal: planMealAction.bind(null, surface, contactId),
    turnOff: returnToTrackingAction.bind(null, surface, contactId),
    cancelPlan: cancelPlanAction.bind(null, surface, contactId),
    confirmPlannedMeal: confirmPlannedMealAction.bind(null, surface, contactId),
    setMealSkipped: setMealSkippedAction.bind(null, surface, contactId),
    chooseHabit: chooseHabitAction.bind(null, surface, contactId),
    answerClarification: answerClarificationAction.bind(null, surface, contactId),
    addSupplement: addSupplementAction.bind(null, surface, contactId),
    setSupplementTaken: setSupplementTakenAction.bind(null, surface, contactId),
    stopSupplement: stopSupplementAction.bind(null, surface, contactId),
  };
}

export type GuidanceActions = ReturnType<typeof guidanceActionsFor>;
