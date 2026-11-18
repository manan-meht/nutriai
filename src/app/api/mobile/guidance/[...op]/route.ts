import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import type { GuidanceContactType } from "@/lib/guidance/authorization";
import type { GuidanceRequest } from "@/lib/guidance/request-actor";
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
import { loadGuidanceDashboard, loadGuidanceView } from "@/lib/guidance/view";
import { createServiceClient } from "@/lib/supabase/server";

// Guidance for the mobile app, as JSON. The app reaches it through
// nutriai-mobile-api (its .../guidance/... routes forward here), so the app
// runs the same Guidance code as the web: the same gates, the same
// aggregation, the same suggestions.
//
// The caller is a signed-in account holder (family caregiver, coach, or
// someone tracking themselves), identified by the Supabase access token in
// `Authorization: Bearer`, validated against Supabase Auth on every call.
// From there it's the web's own path: lib/guidance/requests.ts, whose
// services check permission, the release gate and that Guidance is on.
//
//   GET  state?type=adults|gym&id=<contact id>   what the app shows
//   POST <op>  { type, id, ...input }             propose, confirm, off,
//        adjust, plan, cancel-plan, confirm-plan, skip, habit, clarify,
//        supplement-add, supplement-taken, supplement-stop

export const dynamic = "force-dynamic";

async function caller(request: NextRequest): Promise<string | null> {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

function contactTypeOf(value: unknown): GuidanceContactType | null {
  return value === "adults" || value === "gym" ? value : null;
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest, { params }: { params: Promise<{ op: string[] }> }) {
  const { op } = await params;
  if (op.join("/") !== "state") return json({ error: "not_found" }, 404);
  const profileId = await caller(request);
  if (!profileId) return json({ error: "unauthorized" }, 401);
  const contactType = contactTypeOf(request.nextUrl.searchParams.get("type"));
  const contactId = request.nextUrl.searchParams.get("id");
  if (!contactType || !contactId) return json({ error: "bad_request" }, 400);

  const db = createServiceClient();
  const actor = { kind: "caregiver" as const, profileId };
  // The view answers "may this caller see this person at all": a stranger
  // gets not_found, and nothing else is loaded for them.
  const view = await loadGuidanceView(db, { contactId, contactType, actor });
  if (view.kind === "not_found") return json({ error: "not_found" }, 404);
  const dashboard = view.kind === "active" ? await loadGuidanceDashboard(db, { contactId, contactType }) : null;
  return json({ view, dashboard });
}

type Handler = (db: ReturnType<typeof createServiceClient>, r: GuidanceRequest, contactId: string, body: Record<string, unknown>) => Promise<unknown>;

const OPS: Record<string, Handler> = {
  propose: (db, r, id, b) => proposeGuidanceRequest(db, r, id, b.answers),
  confirm: (db, r, id, b) => confirmGuidanceRequest(db, r, id, b.answers),
  off: (db, r, id) => returnToTrackingRequest(db, r, id),
  adjust: (db, r, id, b) => adjustTargetsRequest(db, r, id, b.targets, b.note),
  plan: (db, r, id, b) => planMealRequest(db, r, id, b.optionId),
  "cancel-plan": (db, r, id, b) => cancelPlanRequest(db, r, id, b.planId),
  "confirm-plan": (db, r, id, b) => confirmPlannedMealRequest(db, r, id, b.planId),
  skip: (db, r, id, b) => setMealSkippedRequest(db, r, id, b),
  habit: (db, r, id, b) => chooseHabitRequest(db, r, id, b),
  clarify: (db, r, id, b) => answerClarificationRequest(db, r, id, b),
  "supplement-add": (db, r, id, b) => addSupplementRequest(db, r, id, b),
  "supplement-taken": (db, r, id, b) => setSupplementTakenRequest(db, r, id, b),
  "supplement-stop": (db, r, id, b) => stopSupplementRequest(db, r, id, b.scheduleId),
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ op: string[] }> }) {
  const { op } = await params;
  const handler = OPS[op.join("/")];
  if (!handler) return json({ error: "not_found" }, 404);
  const profileId = await caller(request);
  if (!profileId) return json({ error: "unauthorized" }, 401);
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const contactType = contactTypeOf(body.type);
  if (!contactType || typeof body.id !== "string") return json({ error: "bad_request" }, 400);
  const result = await handler(createServiceClient(), { actor: { kind: "caregiver", profileId }, contactType }, body.id, body);
  return json(result);
}
