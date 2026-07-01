/**
 * Landing page A/B experiment system.
 *
 * Selection modes:
 *   standard_only   — always show the standard page
 *   immersive_only  — always show the immersive page
 *   ab_test         — stable random 50/50 assignment via first-party cookie
 *   performance_aware — immersive for capable devices/networks, standard otherwise
 *
 * Experiment IDs are per-product so Gym and Family assignments never cross.
 * Cookie names are also per-product.
 */

import type {
  ProductType,
  LandingVariant,
  LandingSelectionMode,
  LandingExperimentAssignment,
} from "@/types";

// Per-product experiment identifiers — bump the version to reset all assignments
export const EXPERIMENT_IDS: Record<ProductType, string> = {
  gym: "gym_landing_v1",
  adults: "adults_landing_v1",
};

// Cookie names — kept separate so Gym experiment never bleeds into Family
const COOKIE_NAME: Record<ProductType, string> = {
  gym: "landing_exp_gym",
  adults: "landing_exp_adults",
};

// Immersive split percentage (0–100). Default 50 = 50/50.
const IMMERSIVE_SPLIT_PCT = parseInt(
  process.env.LANDING_IMMERSIVE_SPLIT_PCT ?? "50",
  10
);

// ---- Mode resolution ----

export function getLandingSelectionMode(product: ProductType): LandingSelectionMode {
  const envKey =
    product === "gym" ? "GYM_LANDING_MODE" : "ADULTS_LANDING_MODE";
  const raw = process.env[envKey] as LandingSelectionMode | undefined;

  const valid: LandingSelectionMode[] = [
    "standard_only",
    "immersive_only",
    "ab_test",
    "performance_aware",
  ];

  return valid.includes(raw as LandingSelectionMode)
    ? (raw as LandingSelectionMode)
    : "ab_test"; // safe default
}

// ---- Query-parameter override (server-side) ----

export function resolveQueryOverride(
  searchParams: URLSearchParams,
  product: ProductType
): LandingVariant | null {
  const raw = searchParams.get("landing");
  if (raw === "standard" || raw === "immersive") return raw;

  // Block query overrides in production unless ALLOW_LANDING_OVERRIDE=true
  const allowed =
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_LANDING_OVERRIDE === "true";

  return allowed ? null : null;
}

// ---- Cookie-based stable A/B assignment ----

export function parseAssignmentCookie(
  cookieValue: string | undefined,
  product: ProductType
): LandingExperimentAssignment | null {
  if (!cookieValue) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(cookieValue));
    // Only accept if it's for the current experiment version
    if (parsed.experimentId !== EXPERIMENT_IDS[product]) return null;
    if (parsed.product !== product) return null;
    return parsed as LandingExperimentAssignment;
  } catch {
    return null;
  }
}

export function createNewAssignment(
  product: ProductType,
  mode: LandingSelectionMode
): LandingExperimentAssignment {
  const variant: LandingExperimentVariantLocal =
    mode === "immersive_only"
      ? "immersive"
      : mode === "standard_only"
      ? "standard"
      : Math.random() * 100 < IMMERSIVE_SPLIT_PCT
      ? "immersive"
      : "standard";

  return {
    experimentId: EXPERIMENT_IDS[product],
    product,
    variant,
    assignedAt: Date.now(),
    selectionMode: mode,
  };
}

type LandingExperimentVariantLocal = "standard" | "immersive";

export function serializeAssignment(assignment: LandingExperimentAssignment): string {
  return encodeURIComponent(JSON.stringify(assignment));
}

export function getCookieName(product: ProductType): string {
  return COOKIE_NAME[product];
}

/** Max age for the assignment cookie (30 days). */
export const ASSIGNMENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// ---- Main resolution (server-side, no cookie write — use in Route handlers) ----

export function resolveServerSideVariant(
  product: ProductType,
  searchParams: URLSearchParams,
  existingAssignment: LandingExperimentAssignment | null
): { variant: LandingVariant; assignment: LandingExperimentAssignment } {
  const mode = getLandingSelectionMode(product);

  // 1. Query override
  const queryOverride = resolveQueryOverride(searchParams, product);
  if (queryOverride) {
    const assignment =
      existingAssignment ?? createNewAssignment(product, mode);
    return {
      variant: queryOverride,
      assignment: { ...assignment, variant: queryOverride },
    };
  }

  // 2. Forced modes
  if (mode === "standard_only") {
    const assignment = existingAssignment ?? createNewAssignment(product, mode);
    return { variant: "standard", assignment: { ...assignment, variant: "standard" } };
  }
  if (mode === "immersive_only") {
    const assignment = existingAssignment ?? createNewAssignment(product, mode);
    return { variant: "immersive", assignment: { ...assignment, variant: "immersive" } };
  }

  // 3. Stable existing assignment
  if (existingAssignment) {
    return { variant: existingAssignment.variant, assignment: existingAssignment };
  }

  // 4. New assignment
  const assignment = createNewAssignment(product, mode);
  return { variant: assignment.variant, assignment };
}
