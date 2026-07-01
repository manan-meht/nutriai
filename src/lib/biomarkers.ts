export const BIOMARKERS = {
  weight_kg:       { label: "Weight",           unit: "kg", color: "#9333ea" },
  bmi:             { label: "BMI",              unit: "",   color: "#6366f1" },
  body_fat_pct:    { label: "Body Fat",         unit: "%",  color: "#f97316" },
  waist_cm:        { label: "Waist",            unit: "cm", color: "#f59e0b" },
  hip_cm:          { label: "Hip",              unit: "cm", color: "#ec4899" },
  waist_hip_ratio: { label: "Waist-Hip Ratio",  unit: "",   color: "#ef4444" },
  chest_cm:        { label: "Chest",            unit: "cm", color: "#0ea5e9" },
  bicep_cm:        { label: "Bicep",            unit: "cm", color: "#8b5cf6" },
  neck_cm:         { label: "Neck",             unit: "cm", color: "#14b8a6" },
  thigh_cm:        { label: "Thigh",            unit: "cm", color: "#06b6d4" },
} as const;

export type BiomarkerKey = keyof typeof BIOMARKERS;

export const BIOMARKER_KEYS = Object.keys(BIOMARKERS) as BiomarkerKey[];

// Which markers are auto-calculated (server-side generated columns)
export const DERIVED_MARKERS: BiomarkerKey[] = ["waist_hip_ratio"];

export function formatValue(key: BiomarkerKey, value: number): string {
  const { unit } = BIOMARKERS[key];
  if (key === "bmi" || key === "waist_hip_ratio") return value.toFixed(1);
  if (key === "body_fat_pct") return `${value.toFixed(1)}${unit}`;
  return `${value}${unit}`;
}
