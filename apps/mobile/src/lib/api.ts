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

/** Separate from apiRequest — that helper always sets Content-Type:
 * application/json whenever a body is present, which would break a
 * multipart upload (fetch needs to set its own Content-Type with the
 * multipart boundary, which only happens automatically when nothing else
 * sets that header first). Used for the contact-avatar upload — see
 * ContactAvatarPicker's doc comment for why this takes a local file URI
 * rather than a File/Blob (React Native has neither). */
async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new ApiError(401, "Not authenticated");

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${session.access_token}` },
    body: formData,
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

/** Mirrors the categories the web feedback form offers (see the main app's
 * src/lib/feedback/types.ts) and mobile-api's /me/feedback validation.
 * Kept in this file's local-types spirit rather than imported. */
export type FeedbackType = "general" | "feature_request" | "bug" | "ai_inaccurate" | "billing" | "other";

export const FEEDBACK_TYPE_OPTIONS: Array<{ value: FeedbackType; label: string }> = [
  { value: "general", label: "General feedback" },
  { value: "feature_request", label: "Feature request" },
  { value: "bug", label: "Something is not working" },
  { value: "ai_inaccurate", label: "AI or meal analysis was inaccurate" },
  { value: "billing", label: "Billing or account issue" },
  { value: "other", label: "Other" },
];

export const FEEDBACK_MESSAGE_MIN_LENGTH = 10;
export const FEEDBACK_MESSAGE_MAX_LENGTH = 2000;

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
    requiresCardBeforeTrial: boolean;
    /** True for BILLING_TEST_WHITELIST_EMAILS accounts — the dashboard
     * shows an explicit "whitelisted test account" message instead of
     * either a payment prompt or the ordinary trial countdown. */
    isBillingWhitelisted: boolean;
  };
  caregiverEmail: string | null;
  caregiverName: string | null;
  /** Digits-only bot number for a plain wa.me reconnect link once WhatsApp's
   * 24h customer-service window has lapsed (see the "stale" invite state in
   * person-detail.tsx/person-card.tsx) — undefined if not configured. */
  tistraWhatsAppNumber?: string;
}

// Food Balance Score profile fields (see nutrition-core's
// FoodBalanceProfileFields) — same shape reused by both AdultsContact and
// GymClient below, mirroring that package's inheritance via a shared
// interface rather than duplicating the fields inline twice here.
export interface FoodBalanceProfileFields {
  dateOfBirth?: string;
  metabolicEquationSex?: "male" | "female";
  /** Legacy — kept for audit/back-compat only, new code reads
   * derivedActivityLevel instead. */
  activityLevel?: "mostly_sitting" | "lightly_active" | "moderately_active" | "very_active" | "unknown";
  /** Legacy — kept for audit/back-compat only, new code reads
   * strengthExerciseFrequency instead. */
  resistanceTrainingStatus?: "regularly" | "sometimes" | "not_currently" | "unknown";
  dailyMovementLevel?: "mostly_seated" | "mixed_light_movement" | "moving_several_hours" | "physically_demanding" | "not_sure";
  weeklyModerateActivity?: "under_30" | "30_to_89" | "90_to_149" | "150_to_299" | "300_plus" | "not_sure";
  strengthExerciseFrequency?: "zero_days" | "less_than_weekly" | "one_day" | "two_days" | "three_plus_days" | "not_sure";
  derivedActivityLevel?: "not_active" | "lightly_active" | "moderately_active" | "very_active";
  activityProfileMigrated?: boolean;
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

// Mirrors packages/nutrition-core's MacroWindowSummary — sum of a
// person's logged macros over a window, from the midpoint of each meal's
// min/max range. Used as the family/coach picker screen's fallback when
// there isn't enough data yet for a Food Balance Score (see PersonCard).
export interface MacroWindowSummary {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
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
  /** Short-lived signed URL — undefined when no photo has been uploaded,
   * in which case the UI falls back to a colored-initials placeholder. */
  photoUrl?: string;
  macroSummary?: { today: MacroWindowSummary; week: MacroWindowSummary };
  goals: Goal[];
  trackedBiomarkers: string[];
  /** WhatsApp meal reminders (migration 0016) — adults-only. */
  remindersEnabled: boolean;
  reminderTimes: string[];
  /** Set once a contact has been removed (soft-deleted) — only present on
   * rows returned by getRemovedAdultsContacts, never on getAdultsContacts. */
  deletedAt?: string;
  /** WhatsApp invite status — mirrors the web dashboard's inviteSentAt/
   * inviteAcceptedAt-derived "Not connected yet"/"Accepted" badge (see
   * AdultsDashboardClient.tsx). Always set on creation (see addContact),
   * so inviteSentAt is really "has an invite ever existed" rather than
   * "was one actually delivered". */
  inviteSentAt?: string;
  inviteAcceptedAt?: string;
  /** Timestamp of the contact's most recent inbound WhatsApp message (any
   * message, not just ones that resulted in a logged meal). Used to detect
   * "connected but gone quiet" — inviteAcceptedAt set, but lastMessageAt
   * more than 24h ago, past which WhatsApp's own customer-service window
   * blocks meal reminders (see send-meal-reminders/route.ts). Undefined if
   * the contact has no conversation row yet. */
  lastMessageAt?: string;
  /** Short-lived signed URL for the most recent logged meal's photo —
   * undefined if that meal has no photo or there are no meals yet, in
   * which case the UI shows a placeholder. Mirrors the web dashboard's
   * identical field (see AdultsContact in @nutriai/nutrition-core). */
  lastMealPhotoUrl?: string;
  /** Total logged calories per day for the rolling 7 days ending today,
   * oldest first, always 7 entries (0 for days with no meals) — feeds
   * FamilyHealthCard's calorie trend sparkline. */
  last7DaysCalories?: number[];
  /** Meal count for a true rolling 7-day window ending today — distinct
   * from macroSummary.week's Monday-reset calendar-week count. Drives the
   * dynamic launcher icon (see lib/dynamic-app-icon.ts). */
  last7DaysMealCount?: number;
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
  /** Retrieval-backed coaching line for this meal, when one exists. */
  coachingSuggestion?: string;
  /** Family-loop: the emoji this caregiver already sent for this meal. */
  myReaction?: string;
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
  macroSummary?: { today: MacroWindowSummary; week: MacroWindowSummary };
  /** Meal count for a true rolling 7-day window ending today — see
   * AdultsContact.last7DaysMealCount's identical doc. */
  last7DaysMealCount?: number;
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

// Mirrors the main web app's InviteSummary (src/lib/invites/types.ts) —
// what's needed to show a "Send invite via WhatsApp" action after adding a
// family member (see apps/mobile-api's GET /adults/contacts/:id/invite).
export interface InviteSummary {
  token: string;
  link: string;
  shareLink?: string;
  shareMessage?: string;
  status: "pending" | "claimed" | "expired" | "revoked";
  expiresAt: string;
  claimedByWhatsappNumberMasked: string | null;
  claimedAt: string | null;
  linkOpenedAt: string | null;
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

  // `self: true` mirrors the web app's one-time ?self=1 redirect param —
  // pass it the first time someone lands here having picked "Self" rather
  // than "Family" from the product picker (see (app)/index.tsx), so a
  // brand-new self-tracking signup's workspace gets marked "self" instead
  // of defaulting to "family".
  getAdultsWorkspace: (opts: { self?: boolean } = {}) =>
    apiFetch<AdultsWorkspaceResponse>(opts.self ? "/adults/workspace?self=1" : "/adults/workspace"),
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

  /** Family-loop reaction — first reaction on a meal sends the contact a
   * WhatsApp "seen by family" line; emoji changes update silently. */
  reactToAdultsMeal: (contactId: string, mealLogId: string, emoji: "👍" | "🎉" | "❤️") =>
    apiRequest<{ emoji?: string; error?: string }>(`/adults/contacts/${contactId}/meal-reactions`, {
      method: "POST",
      body: JSON.stringify({ mealLogId, emoji }),
    }),

  createAdultsContact: (body: unknown) =>
    apiRequest<{ id: string }>("/adults/contacts", { method: "POST", body: JSON.stringify(body) }),
  getFamilyInvite: (contactId: string) => apiFetch<InviteSummary>(`/adults/contacts/${contactId}/invite`),
  updateAdultsContact: (contactId: string, body: unknown) =>
    apiRequest<{ id: string }>(`/adults/contacts/${contactId}`, { method: "PATCH", body: JSON.stringify(body) }),
  /** `imageUri` is a local file:// URI from expo-image-picker — React
   * Native's fetch accepts { uri, name, type } in place of a real
   * File/Blob for FormData entries (there's no File/Blob for an on-device
   * photo in RN the way there is in a browser). */
  uploadContactAvatar: (contactId: string, imageUri: string, mimeType: string) => {
    const formData = new FormData();
    const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    formData.append("photo", { uri: imageUri, name: `avatar.${extension}`, type: mimeType } as any);
    return apiUpload<{ photoUrl: string }>(`/adults/contacts/${contactId}/avatar`, formData);
  },
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

  /** In-app feedback. The email/name/account type are all derived from the
   * bearer token server-side, so nothing identifying is sent from here —
   * only what the user typed, plus a platform/version string for triage. */
  submitFeedback: (feedbackType: FeedbackType, message: string, client: string) =>
    apiRequest<{ ok: true }>("/me/feedback", {
      method: "POST",
      body: JSON.stringify({ feedbackType, message, client }),
    }),
};
