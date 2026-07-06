export type ReviewPriority = "high" | "medium" | "low";

export interface PriorityInput {
  confidenceScore?: number | null;
  imageQuality?: string | null;
  detectedItems: string[];
  proteinAnchorStatus?: string | null;
  caption?: string | null;
  isMixedMealOrThali?: boolean;
  isNewFoodItem?: boolean;
  isRandomQaSample?: boolean;
  isDisputed?: boolean;
  isEscalated?: boolean;
}

const INDIAN_PROTEIN_FOODS = [
  "dal", "daal", "chana", "rajma", "sambar", "curd", "paneer", "tofu", "egg",
  "fish", "chicken", "sprouts", "bean", "lentil", "soy chunks", "soya chunks",
];

export function computeReviewPriority(input: PriorityInput): ReviewPriority {
  const detectedText = input.detectedItems.join(" ").toLowerCase();
  const hasIndianProteinFood = INDIAN_PROTEIN_FOODS.some((f) => detectedText.includes(f));
  const proteinMissingButFoodPresent = input.proteinAnchorStatus === "missing" && hasIndianProteinFood;

  const lowConfidence = input.confidenceScore != null && input.confidenceScore < 0.7;
  const midConfidence = input.confidenceScore != null && input.confidenceScore >= 0.7 && input.confidenceScore <= 0.85;
  const badImage = input.imageQuality === "blurry" || input.imageQuality === "unknown";
  const unknownFood = input.detectedItems.length === 0;
  const noCaptionLowConfidence = !input.caption && lowConfidence;

  if (
    input.isEscalated ||
    input.isDisputed ||
    lowConfidence ||
    badImage ||
    unknownFood ||
    noCaptionLowConfidence ||
    proteinMissingButFoodPresent
  ) {
    return "high";
  }

  if (midConfidence || input.isMixedMealOrThali || input.isNewFoodItem || input.isRandomQaSample) {
    return "medium";
  }

  return "low";
}
