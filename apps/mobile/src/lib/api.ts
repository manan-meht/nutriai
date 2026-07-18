import { supabase } from "./supabase";

const API_BASE_URL = process.env.EXPO_PUBLIC_MOBILE_API_URL!;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

/** Calls apps/mobile-api (see that project's README) with the current
 * Supabase session's access token as a bearer token — mirrors exactly how
 * that app's src/lib/supabase.ts#getUserFromBearerToken expects to be
 * called. Throws ApiError(401) if there's no active session, which callers
 * should treat as "redirect to login" rather than retry. */
async function apiFetch<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

async function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "DELETE" });
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ApiError(401, "Not authenticated");

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }

  return res.json();
}

// ---- Types mirroring apps/mobile-api's JSON responses ----
// (Deliberately kept local rather than importing @nutriai/nutrition-core,
// even though this app now has build-time access to that workspace
// package — these describe mobile-api's HTTP response contract
// specifically, which is a reduced/reshaped subset of the internal domain
// types by design, e.g. FoodBalanceScoreResult below intentionally omits
// component scores and recommendation reasons that the real
// packages/health-scoring type carries. Decoupling the wire contract from
// the domain types is the point, not something to "fix" by importing.)

export interface Goal {
  id: string;
  goalType: string;
  title: string;
  description?: string;
  targetCaloriesMin?: number;
  targetCaloriesMax?: number;
  targetProteinG?: number;
  targetMealsPerDay?: number;
  status: string;
}

export interface AdultsWorkspaceResponse {
  workspace: { id: string; name: string; extraCapacity: number; plan: string };
  entitlement: {
    status: string;
    trialStartAt: string | null;
    trialEndAt: string | null;
    trialDaysRemaining: number | null;
    isReadOnly: boolean;
  };
  caregiverEmail: string | null;
  caregiverName: string | null;
}

// Food Balance Score profile fields (see nutrition-core's
// FoodBalanceProfileFields) — same shape reused by both AdultsContact and
// GymClient below, mirroring that package's inheritance via a shared
// interface rather than duplicating the fields inline twice here.
export interface FoodBalanceProfileFields {
  dateOfBirth?: string;
  metabolicEquationSex?: "male" | "female";
  activityLevel?: "mostly_sitting" | "lightly_active" | "moderately_active" | "very_active" | "unknown";
  resistanceTrainingStatus?: "regularly" | "sometimes" | "not_currently" | "unknown";
  preferredUnits?: "metric" | "imperial";
  primaryNutritionGoal?:
    | "reduce_weight"
    | "reduce_body_fat"
    | "gain_muscle"
    | "body_recomposition"
    | "maintain_weight"
    | "improve_nutrition"
    | "healthy_aging";
  targetWeightKg?: number;
}

export interface AdultsContact extends FoodBalanceProfileFields {
  id: string;
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  relationship?: string;
  relationshipType: "self" | "family_caregiver";
  age?: number;
  gender?: "male" | "female" | "other";
  weightKg?: number;
  heightCm?: number;
  mealCount: number;
  lastMealAt?: string;
  goals: Goal[];
  trackedBiomarkers: string[];
  /** WhatsApp meal reminders (migration 0016) — adults-only. */
  remindersEnabled: boolean;
  reminderTimes: string[];
}

export interface MealLog {
  id: string;
  mealType: string;
  loggedAt: string;
  foods: any[];
  totalCaloriesMin: number;
  totalCaloriesMax: number;
  totalProteinMin: number;
  totalProteinMax: number;
  totalCarbsMin: number;
  totalCarbsMax: number;
  totalFatMin: number;
  totalFatMax: number;
  totalFiberMin: number;
  totalFiberMax: number;
  aiSummary?: string;
  imageUrl?: string;
}

export interface AdultsContactDetails {
  contact: AdultsContact;
  meals: MealLog[];
}

export interface GymWorkspaceResponse {
  workspace: { id: string; name: string; extraCapacity: number };
  entitlement: {
    status: string;
    trialStartAt: string | null;
    trialEndAt: string | null;
    trialDaysRemaining: number | null;
    isReadOnly: boolean;
  };
}

export interface GymClient extends FoodBalanceProfileFields {
  id: string;
  workspaceId: string;
  fullName: string;
  whatsappNumber: string;
  age?: number;
  gender?: "male" | "female" | "other";
  weightKg?: number;
  heightCm?: number;
  bmi?: number;
  mealCount: number;
  lastMealAt?: string;
  goals: Goal[];
  trackedBiomarkers: string[];
}

export interface WorkoutLog {
  id: string;
  loggedAt: string;
  description?: string;
  workoutType?: string;
  durationMinutes?: number;
}

export interface BiomarkerLog {
  id: string;
  loggedAt: string;
  weightKg?: number;
  bmi?: number;
  waistCm?: number;
  hipCm?: number;
  waistHipRatio?: number;
  bodyFatPct?: number;
  neckCm?: number;
  chestCm?: number;
  bicepCm?: number;
  thighCm?: number;
  notes?: string;
}

export interface GymClientDetails {
  client: GymClient;
  meals: MealLog[];
  workouts: WorkoutLog[];
  biomarkers: BiomarkerLog[];
}

// Temporary Access Codes — mirrors the web app's AccessCodeCard/
// generateAccessCodeAction family (see @nutriai/end-user-core's otp.ts
// and src/app/(adults)/adults/dashboard/actions.ts on the web side). The
// plaintext code only ever lives in this response and the caller's own
// component state — never persisted or logged.
export interface AccessCodeResult {
  code: string;
  formattedCode: string;
  expiresAt: string;
}

export interface MyProductsResponse {
  adults: { workspaceId: string } | null;
  gym: { workspaceId: string } | null;
}

// Only the fields FoodBalanceScoreCard actually renders — mirrors
// nutriai-fresh's apps/mobile/src/components/FoodBalanceScoreCard.tsx's own
// local type, not the full FoodBalanceScoreResult from
// packages/health-scoring (component scores, recommendation reasons, etc.
// aren't shown here).
export interface FoodBalanceScoreResult {
  score: number | null;
  status: "collecting_data" | "refreshing_data" | "foundation_only" | "partially_personalized" | "fully_personalized";
  confidence: number;
  dataCoverage: {
    eligibleMealCount: number;
    requiredMealCount: number;
    distinctLoggingDays: number;
    requiredLoggingDays: number;
  };
  recommendations: Array<{
    id: string;
    title: string;
    description: string;
    action?: string;
    whyThisHelps?: string;
    exampleFoodIds?: string[];
  }>;
}

export type RecommendationFeedback = "helpful" | "not_useful" | "already_eat" | "dont_like" | "not_available" | "too_hard";

// ---- API calls ----

export const api = {
  // Side-effect-free — unlike getAdultsWorkspace/getGymWorkspace below,
  // this never creates a workspace. Use this to decide which
  // dashboard(s) to route into after login (see apps/mobile-api's
  // /me/products route for why the get-or-create endpoints can't be used
  // for that).
  getMyProducts: () => apiFetch<MyProductsResponse>("/me/products"),

  getAdultsWorkspace: () => apiFetch<AdultsWorkspaceResponse>("/adults/workspace"),
  getAdultsContacts: () => apiFetch<{ contacts: AdultsContact[] }>("/adults/contacts"),
  getAdultsContactDetails: (contactId: string) =>
    apiFetch<AdultsContactDetails>(`/adults/contacts/${contactId}`),

  getGymWorkspace: () => apiFetch<GymWorkspaceResponse>("/gym/workspace"),
  getGymClients: () => apiFetch<{ clients: GymClient[] }>("/gym/clients"),
  getGymClientDetails: (clientId: string) =>
    apiFetch<GymClientDetails>(`/gym/clients/${clientId}`),

  // Feature-flagged server-side — returns 404 with {error:"Not available"}
  // when NEXT_PUBLIC_FOOD_BALANCE_SCORE_V1 isn't set on mobile-api's
  // deployment; callers should treat any failure as "don't show the card"
  // rather than a hard error (see FoodBalanceScoreCard).
  getFoodBalanceScore: (params: { contactId: string } | { clientId: string }) =>
    apiFetch<FoodBalanceScoreResult>(
      `/food-balance-score?${"contactId" in params ? `contactId=${params.contactId}` : `clientId=${params.clientId}`}`
    ),

  // Records feedback on a recommendation's shown foods (Helpful/Not
  // useful/Already eat/Don't like/Not available/Too hard) — mirrors the
  // web app's server actions that call applyRecommendationFeedback,
  // folded into the same POST /food-balance-score route (see that
  // route's own comment on why: fixed Worker bundle overhead per route).
  recordFoodBalanceFeedback: (
    params: { contactId: string } | { clientId: string },
    feedback: RecommendationFeedback,
    foodIds: string[]
  ) => apiRequest<{ ok: boolean }>("/food-balance-score", { method: "POST", body: JSON.stringify({ ...params, feedback, foodIds }) }),

  createAdultsContact: (body: unknown) =>
    apiRequest<{ id: string }>("/adults/contacts", { method: "POST", body: JSON.stringify(body) }),
  updateAdultsContact: (contactId: string, body: unknown) =>
    apiRequest<{ id: string }>(`/adults/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify(body) }),
  createGymClient: (body: unknown) =>
    apiRequest<{ id: string }>("/gym/clients", { method: "POST", body: JSON.stringify(body) }),
  updateGymClient: (clientId: string, body: unknown) =>
    apiRequest<{ id: string }>(`/gym/clients/${clientId}`, { method: "PATCH", body: JSON.stringify(body) }),

  generateAdultsAccessCode: (contactId: string, ttlHours: 1 | 24 = 24) =>
    apiRequest<AccessCodeResult>(`/adults/contacts/${contactId}/access-code`, { method: "POST", body: JSON.stringify({ ttlHours }) }),
  regenerateAdultsAccessCode: (contactId: string, ttlHours: 1 | 24 = 24) =>
    apiRequest<AccessCodeResult>(`/adults/contacts/${contactId}/access-code`, { method: "PATCH", body: JSON.stringify({ ttlHours }) }),
  revokeAdultsAccessCode: (contactId: string) =>
    apiDelete<{ ok: boolean }>(`/adults/contacts/${contactId}/access-code`),

  generateGymAccessCode: (clientId: string, ttlHours: 1 | 24 = 24) =>
    apiRequest<AccessCodeResult>(`/gym/clients/${clientId}/access-code`, { method: "POST", body: JSON.stringify({ ttlHours }) }),
  regenerateGymAccessCode: (clientId: string, ttlHours: 1 | 24 = 24) =>
    apiRequest<AccessCodeResult>(`/gym/clients/${clientId}/access-code`, { method: "PATCH", body: JSON.stringify({ ttlHours }) }),
  revokeGymAccessCode: (clientId: string) =>
    apiDelete<{ ok: boolean }>(`/gym/clients/${clientId}/access-code`),

  registerPushToken: (expoPushToken: string, platform: "android" | "ios") =>
    apiRequest<{ ok: true }>("/me/push-token", {
      method: "POST",
      body: JSON.stringify({ expoPushToken, platform }),
    }),
};
