// Verbatim port of src/lib/nutrition/protein-recommendation.ts from the main web app (pure JS/TS, no
// browser/Next.js APIs) — keep in sync manually if the web version changes.

// Default protein target used whenever a caregiver hasn't manually set one
// on the contact's goal. Based on general RDA guidance (~0.8g/kg/day for
// healthy adults) and the higher end recommended for older adults to help
// offset age-related muscle loss (~1.0-1.2g/kg/day, per geriatric nutrition
// guidance such as the PROT-AGE study group).
export interface ProteinRecommendationInput {
  weightKg?: number | null;
  heightCm?: number | null;
  age?: number | null;
  gender?: string | null;
}

const OLDER_ADULT_AGE = 65;
const GRAMS_PER_KG_ADULT = 0.8;
const GRAMS_PER_KG_OLDER_ADULT = 1.1;

// Devine formula (ideal body weight), used only when weight isn't recorded
// but height is — gives a reasonable estimate for sizing a protein target.
function estimateWeightFromHeight(heightCm: number, gender?: string | null): number {
  const heightInches = heightCm / 2.54;
  const inchesOver5Feet = Math.max(0, heightInches - 60);
  const isFemale = gender?.toLowerCase() === "female";
  const base = isFemale ? 45.5 : 50;
  return base + 2.3 * inchesOver5Feet;
}

// Flat RDA fallback (grams/day) when neither weight nor height is known.
function fallbackFlatGrams(gender?: string | null): number {
  if (gender?.toLowerCase() === "female") return 46;
  if (gender?.toLowerCase() === "male") return 56;
  return 50;
}

export function recommendProteinGrams(input: ProteinRecommendationInput): number {
  const factor = input.age && input.age >= OLDER_ADULT_AGE ? GRAMS_PER_KG_OLDER_ADULT : GRAMS_PER_KG_ADULT;

  if (input.weightKg && input.weightKg > 0) {
    return Math.round(input.weightKg * factor);
  }

  if (input.heightCm && input.heightCm > 0) {
    return Math.round(estimateWeightFromHeight(input.heightCm, input.gender) * factor);
  }

  return fallbackFlatGrams(input.gender);
}
