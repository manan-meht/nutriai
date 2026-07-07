import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

/**
 * Base64-encodes a byte array in fixed-size chunks. Spreading an entire
 * image buffer into String.fromCharCode(...bytes) in one call — which this
 * replaced — blows past the JS engine's max-arguments-per-call limit for
 * any real photo (typically hundreds of KB to a few MB), crashing hard
 * enough under Cloudflare's Edge Runtime that it never even reaches a
 * catch block. Chunking avoids that entirely.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 0x8000; // 32KB — comfortably under any engine's argument-count limit
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

export interface FoodItem {
  name: string;
  quantity: string;
  calories_min: number;
  calories_max: number;
  protein_min: number;
  protein_max: number;
  carbs_min: number;
  carbs_max: number;
  fat_min: number;
  fat_max: number;
}

export interface FoodAnalysisResult {
  foods: FoodItem[];
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  total_calories_min: number;
  total_calories_max: number;
  total_protein_min: number;
  total_protein_max: number;
  total_carbs_min: number;
  total_carbs_max: number;
  total_fat_min: number;
  total_fat_max: number;
  summary: string;
  /** Public URL of the uploaded meal photo, attached after analysis (not
   * part of the Gemini response) so it survives in conversation state
   * between the "awaiting confirmation" and "saved" steps. */
  image_url?: string;
}

const SYSTEM_PROMPT = `You are Tistra Health, a nutrition assistant specialized in Indian food. Analyze the meal photo or description provided.

Identify all food items and estimate macros. Use honest ranges — never single values.

Common Indian portion sizes:
- 1 katori/bowl ≈ 100–150g for curries and dals
- 1 roti/chapati ≈ 30–35g (~80 kcal, ~3g protein)
- 1 paratha ≈ 60–80g (~180 kcal, ~4g protein)
- 1 cup cooked rice ≈ 150–200g (~200 kcal, ~4g protein)
- 1 glass milk ≈ 200ml (~120 kcal, ~6g protein)
- 1 egg ≈ 50g (~70 kcal, ~6g protein)
- 1 piece chicken breast ≈ 120–150g (~25–30g protein)

Respond ONLY with valid JSON in exactly this format (no markdown, no code blocks):
{
  "foods": [
    {
      "name": "string",
      "quantity": "string (e.g. 1 katori, 2 rotis, 1 bowl)",
      "calories_min": number,
      "calories_max": number,
      "protein_min": number,
      "protein_max": number,
      "carbs_min": number,
      "carbs_max": number,
      "fat_min": number,
      "fat_max": number
    }
  ],
  "meal_type": "breakfast|lunch|dinner|snack",
  "total_calories_min": number,
  "total_calories_max": number,
  "total_protein_min": number,
  "total_protein_max": number,
  "total_carbs_min": number,
  "total_carbs_max": number,
  "total_fat_min": number,
  "total_fat_max": number,
  "summary": "brief one-line summary, e.g. Dal rice with sabzi and roti"
}`;

export async function analyzeFood(input: {
  text?: string;
  imageBuffer?: Uint8Array;
  imageMimeType?: string;
  correctionContext?: string;
}): Promise<FoodAnalysisResult> {
  const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

  let textPrompt = SYSTEM_PROMPT;
  if (input.correctionContext) {
    textPrompt += `\n\nPrevious identification: ${input.correctionContext}\nUser correction: ${input.text ?? ""}`;
  } else if (input.text) {
    textPrompt += `\n\nMeal description: ${input.text}`;
  }

  const parts: any[] = [];

  if (input.imageBuffer) {
    parts.push({
      inlineData: {
        data: uint8ArrayToBase64(input.imageBuffer),
        mimeType: input.imageMimeType ?? "image/jpeg",
      },
    });
  }

  parts.push({ text: textPrompt });

  const result = await model.generateContent(parts);
  const raw = result.response.text().trim();

  // Strip markdown code blocks if present
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    return JSON.parse(cleaned) as FoodAnalysisResult;
  } catch {
    throw new Error(`Gemini returned invalid JSON: ${cleaned.slice(0, 200)}`);
  }
}

export function buildConfirmationMessage(analysis: FoodAnalysisResult): string {
  const foodLines = analysis.foods
    .map((f) => `• ${f.name} – ${f.quantity} (~${Math.round((f.protein_min + f.protein_max) / 2)}g protein)`)
    .join("\n");

  const proteinRange = `${analysis.total_protein_min}–${analysis.total_protein_max}g protein`;
  const calRange = `${analysis.total_calories_min}–${analysis.total_calories_max} kcal`;

  return `I can see:\n${foodLines}\n\nTotal estimate: *${proteinRange}, ${calRange}*\n\nDoes that look right? Reply *Yes* to log it, or tell me what to change 😊`;
}

export function buildSuccessMessage(analysis: FoodAnalysisResult, targetProteinG?: number): string {
  const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const mealType = analysis.meal_type.charAt(0).toUpperCase() + analysis.meal_type.slice(1);
  const avgProtein = Math.round((analysis.total_protein_min + analysis.total_protein_max) / 2);
  const avgCal = Math.round((analysis.total_calories_min + analysis.total_calories_max) / 2);

  let note = "Keep it up! 💪";
  if (targetProteinG) {
    const pct = Math.round((avgProtein / targetProteinG) * 100);
    if (pct >= 25) note = `That's ~${pct}% of your daily protein target. Keep it up! 💪`;
  }

  return `✅ *${mealType} logged!*\n\n_${time}_\n${avgProtein}g protein | ${avgCal} kcal\n\n${note}`;
}
