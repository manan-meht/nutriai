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
  nutritionGoals?: Array<
    | "reduce_weight"
    | "reduce_body_fat"
    | "gain_muscle"
    | "body_recomposition"
    | "maintain_weight"
    | "improve_nutrition"
    | "healthy_aging"
  >;
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
  /** Set once a contact has been removed (soft-deleted) — only present on
   * rows returned by getRemovedAdultsContacts, never on getAdultsContacts. */
  deletedAt?: string;
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
  /** Set once a client has been removed (soft-deleted) — only present on
   * rows returned by getRemovedGymClients, never on getGymClients. */
  deletedAt?: string;
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
  /** Share cards ("Your wins") earned as of this response — see
   * lib/share-cards/ (mirrors src/lib/share-cards/ on the main web app). */
  earnedShareCards: import("./share-cards/types").EarnedShareCard[];
  recommendedMacroTargets?: MacroTargets;
  activeMacroTargets?: MacroTargets;
}

export type RecommendationFeedback = "helpful" | "not_useful" | "already_eat" | "dont_like" | "not_available" | "too_hard";

// Mirrors @nutriai/health-scoring's MacroTargetValue/MacroTargets (see
// packages/health-scoring/src/food-balance/macro-targets.ts) — a plain
// local type rather than importing the package directly, same reasoning
// as FoodBalanceScoreResult above (this app doesn't otherwise depend on
// @nutriai/health-scoring's types at the UI layer).
export interface MacroTargetValue {
  min: number | null;
  target: number;
  max: number | null;
  unit: "kcal" | "g";
  source: "tistra_recommended" | "user_custom" | "coach_custom";
}

export interface MacroTargets {
  calories: MacroTargetValue;
  protein: MacroTargetValue;
  carbs: MacroTargetValue;
  fat: MacroTargetValue;
  fiber: MacroTargetValue;
  selectedGoals: string[];
  strategy: string;
  explanation: string;
  isProfileIncomplete: boolean;
  calculatedAt: string;
}

export type MacroKey = "calories" | "protein" | "carbs" | "fat" | "fiber";

// Only the fields the mobile "Food preferences" editor actually reads/
// writes — mirrors the main web app's DietaryProfile
// (src/lib/dietary-profile/types.ts), not the full shape (observed_*/
// inferred_pattern/suggestion-feedback arrays aren't shown or edited here).
export interface DietaryProfile {
  explicit_vegan: boolean;
  explicit_vegetarian: boolean;
  explicit_avoids_dairy: boolean;
  explicit_avoids_lactose: boolean;
  explicit_avoids_eggs: boolean;
  explicit_avoids_chicken: boolean;
  explicit_avoids_fish: boolean;
  explicit_avoids_red_meat: boolean;
  explicit_avoids_pork: boolean;
  observed_eggs: boolean;
  observed_chicken: boolean;
  observed_fish: boolean;
  observed_red_meat: boolean;
  prefers_plant_based_suggestions: boolean;
  /** Null until the user has explicitly saved a preference at least once
   * (see applyExplicitPreferences on the mobile-api side) — used to decide
   * whether the editor still needs prominent dashboard placement or has
   * moved into the edit-contact screen for good. */
  last_updated_at: string | null;
}

export interface FoodPreferenceSelections {
  isVegan?: boolean;
  eatsVegetarian?: boolean;
  eatsEggs?: boolean;
  eatsChicken?: boolean;
  eatsFishOrSeafood?: boolean;
  eatsRedMeat?: boolean;
  avoidsDairy?: boolean;
  avoidsLactose?: boolean;
  avoidsPork?: boolean;
}

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
  // Previously-removed family members — mirrors the web app's
  // getRemovedContacts (data preserved, no longer active).
  getRemovedAdultsContacts: () => apiFetch<{ contacts: AdultsContact[] }>("/adults/contacts/removed"),
  getAdultsContactDetails: (contactId: string) =>
    apiFetch<AdultsContactDetails>(`/adults/contacts/${contactId}`),
  // Soft-delete: preserves the contact's historical data while freeing an
  // active slot — mirrors the web app's removeContact.
  removeAdultsContact: (contactId: string) =>
    apiDelete<{ ok: boolean }>(`/adults/contacts/${contactId}`),

  getGymWorkspace: () => apiFetch<GymWorkspaceResponse>("/gym/workspace"),
  getGymClients: () => apiFetch<{ clients: GymClient[] }>("/gym/clients"),
  getRemovedGymClients: () => apiFetch<{ clients: GymClient[] }>("/gym/clients/removed"),
  getGymClientDetails: (clientId: string) =>
    apiFetch<GymClientDetails>(`/gym/clients/${clientId}`),
  removeGymClient: (clientId: string) =>
    apiDelete<{ ok: boolean }>(`/gym/clients/${clientId}`),

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

  // "Don't show this one again" for a share card — folded into the same
  // route, same reasoning as recordFoodBalanceFeedback above.
  dismissShareCardForever: (params: { contactId: string } | { clientId: string }, conceptId: string) =>
    apiRequest<{ ok: boolean }>("/food-balance-score?resource=share-card-dismiss", {
      method: "PATCH",
      body: JSON.stringify({ ...params, conceptId }),
    }),

  // Macro target edit/reset — mirrors the main web app's contact/client
  // route PATCH handler (see those routes' own comments), folded into
  // this same /food-balance-score route rather than a new one.
  saveMacroTargets: (
    params: { contactId: string } | { clientId: string },
    targets: Partial<Record<MacroKey, { min: number | null; target: number; max: number | null }>>
  ) =>
    apiRequest<{ ok: boolean }>("/food-balance-score?resource=macro-targets", {
      method: "PATCH",
      body: JSON.stringify({ ...params, targets }),
    }),
  resetMacroTargets: (params: { contactId: string } | { clientId: string }) =>
    apiRequest<{ ok: boolean }>("/food-balance-score?resource=macro-targets", {
      method: "PATCH",
      body: JSON.stringify({ ...params, reset: true }),
    }),

  // Adults-only, mirrors the web app's getFoodPreferences/updateFoodPreferences
  // (see src/app/(adults)/adults/dashboard/actions.ts) — no gym equivalent
  // exists on web either.
  getAdultsFoodPreferences: (contactId: string) =>
    apiFetch<DietaryProfile>(`/adults/contacts/${contactId}/food-preferences`),
  updateAdultsFoodPreferences: (contactId: string, selections: FoodPreferenceSelections) =>
    apiRequest<{}>(`/adults/contacts/${contactId}/food-preferences`, { method: "PATCH", body: JSON.stringify(selections) }),

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
