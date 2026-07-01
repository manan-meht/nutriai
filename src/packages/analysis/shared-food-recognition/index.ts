/**
 * Shared Food Recognition Service
 *
 * Pipeline:
 * 1. Gemini 2.0 Flash — fast first-pass image/text analysis
 * 2. Indian Nutrition Database (INDB) lookup for matched foods
 * 3. User confirmation step (caller responsibility)
 * 4. GPT-4o fallback for difficult/uncertain meals
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import type { ConfirmedFoodItem, FoodRecognitionResult, AnalysisConfidence } from "@/types";
import { lookupIndb, estimateNutritionFromIndb } from "./indian-nutrition-db";

// Model identifiers — swap here when newer versions release
const GEMINI_MODEL = "gemini-2.0-flash-exp";
const OPENAI_FALLBACK_MODEL = "gpt-4o";

// Confidence threshold below which GPT-4o fallback triggers
const FALLBACK_CONFIDENCE_THRESHOLD: AnalysisConfidence = "low";

export interface RecognitionInput {
  imageBase64?: string; // base64-encoded image
  imageMimeType?: "image/jpeg" | "image/png" | "image/webp";
  textDescription?: string; // free-text meal description or voice transcript
  languageHint?: "en" | "hi" | "ta" | "te" | "kn" | "ml"; // Indian language hint
}

interface AiRawFood {
  name: string;
  nameLocal?: string;
  quantityDescription?: string;
  estimatedQuantityGrams?: number;
  confidence: "high" | "medium" | "low";
  uncertain: boolean;
}

interface AiRawResult {
  foods: AiRawFood[];
  overallConfidence: "high" | "medium" | "low";
  notes?: string;
}

// ---- Gemini first-pass ----

async function runGeminiAnalysis(input: RecognitionInput): Promise<AiRawResult> {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const systemPrompt = `You are a nutrition analysis assistant specialising in Indian cuisine.
Your task: identify all food items visible or described in the input.
Return ONLY valid JSON matching this schema:
{
  "foods": [
    {
      "name": "English food name",
      "nameLocal": "Hindi or regional name if known",
      "quantityDescription": "e.g. 1 katori, 2 rotis, 1 bowl",
      "estimatedQuantityGrams": 150,
      "confidence": "high|medium|low",
      "uncertain": false
    }
  ],
  "overallConfidence": "high|medium|low",
  "notes": "optional notes about uncertainty"
}
Focus on common Indian home-cooked meals, tiffin foods, and restaurant dishes.
Use katori, bowl, roti, piece, glass as quantity units where appropriate.
If you cannot identify a food, include it with uncertain: true.`;

  const parts: any[] = [{ text: systemPrompt }];

  if (input.imageBase64 && input.imageMimeType) {
    parts.push({
      inlineData: { mimeType: input.imageMimeType, data: input.imageBase64 },
    });
  }

  if (input.textDescription) {
    parts.push({ text: `Meal description: ${input.textDescription}` });
  }

  const result = await model.generateContent(parts);
  const text = result.response.text().replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  try {
    return JSON.parse(text) as AiRawResult;
  } catch {
    // Malformed JSON — treat as low confidence
    return { foods: [], overallConfidence: "low", notes: "Failed to parse Gemini response" };
  }
}

// ---- GPT-4o fallback ----

async function runGPT4oFallback(input: RecognitionInput): Promise<AiRawResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a nutrition analysis assistant specialising in Indian cuisine.
Identify all food items in the input. Return ONLY valid JSON:
{
  "foods": [{"name":"...","nameLocal":"...","quantityDescription":"...","estimatedQuantityGrams":150,"confidence":"high|medium|low","uncertain":false}],
  "overallConfidence": "high|medium|low",
  "notes": "..."
}`,
    },
  ];

  const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

  if (input.imageBase64 && input.imageMimeType) {
    userContent.push({
      type: "image_url",
      image_url: { url: `data:${input.imageMimeType};base64,${input.imageBase64}`, detail: "high" },
    });
  }

  if (input.textDescription) {
    userContent.push({ type: "text", text: `Meal: ${input.textDescription}` });
  }

  if (userContent.length === 0) {
    userContent.push({ type: "text", text: "No input provided." });
  }

  messages.push({ role: "user", content: userContent });

  const response = await openai.chat.completions.create({
    model: OPENAI_FALLBACK_MODEL,
    messages,
    max_tokens: 1000,
    temperature: 0.2,
    response_format: { type: "json_object" },
  });

  try {
    return JSON.parse(response.choices[0].message.content ?? "{}") as AiRawResult;
  } catch {
    return { foods: [], overallConfidence: "low", notes: "GPT-4o response parse failed" };
  }
}

// ---- Enrich with INDB ----

function enrichWithIndb(raw: AiRawFood[]): ConfirmedFoodItem[] {
  return raw.map((item, idx) => {
    const indbMatch = lookupIndb(item.name);
    const quantityGrams = item.estimatedQuantityGrams ?? 150;

    let nutrition: Partial<ConfirmedFoodItem> = {};
    if (indbMatch) {
      const est = estimateNutritionFromIndb(indbMatch.food, quantityGrams);
      nutrition = {
        caloriesEstimated: est.calories,
        proteinGramsEstimated: est.proteinGrams,
        carbohydratesGramsEstimated: est.carbohydratesGrams,
        fatGramsEstimated: est.fatGrams,
        fibreGramsEstimated: est.fibreGrams,
        indbFoodCode: indbMatch.food.code,
        indbMatchConfidence: indbMatch.confidence,
      };
    }

    return {
      id: `item-${idx}`,
      name: item.name,
      nameLocal: item.nameLocal ?? indbMatch?.food.nameLocal,
      quantityDescription: item.quantityDescription,
      quantityGrams,
      aiIdentified: true,
      userCorrected: false,
      ...nutrition,
    };
  });
}

// ---- Public API ----

export async function recogniseMeal(input: RecognitionInput): Promise<FoodRecognitionResult> {
  if (!input.imageBase64 && !input.textDescription) {
    throw new Error("At least one of imageBase64 or textDescription is required");
  }

  const start = Date.now();
  let wasFallback = false;
  let rawResult: AiRawResult;
  let provider: "gemini" | "openai" | "fallback" = "gemini";
  let model = GEMINI_MODEL;

  try {
    rawResult = await runGeminiAnalysis(input);
  } catch (err) {
    // Gemini failed entirely — go straight to GPT-4o
    console.error("[food-recognition] Gemini error, using GPT-4o fallback:", err);
    rawResult = await runGPT4oFallback(input);
    wasFallback = true;
    provider = "openai";
    model = OPENAI_FALLBACK_MODEL;
  }

  // If Gemini returned low confidence, run GPT-4o for a second opinion
  if (!wasFallback && rawResult.overallConfidence === FALLBACK_CONFIDENCE_THRESHOLD) {
    try {
      const fallbackResult = await runGPT4oFallback(input);
      // Use whichever result has higher confidence, preferring GPT-4o on tie
      if (
        fallbackResult.overallConfidence === "high" ||
        (fallbackResult.overallConfidence === "medium" && rawResult.overallConfidence === "low")
      ) {
        rawResult = fallbackResult;
        wasFallback = true;
        provider = "openai";
        model = OPENAI_FALLBACK_MODEL;
      }
    } catch {
      // Keep Gemini result
    }
  }

  const foods = enrichWithIndb(rawResult.foods);
  const uncertainItems = rawResult.foods
    .filter((f) => f.uncertain)
    .map((f) => f.name);

  const confidence: AnalysisConfidence =
    rawResult.overallConfidence === "high"
      ? "high"
      : rawResult.overallConfidence === "medium"
      ? "medium"
      : "low";

  return {
    foods,
    confidence,
    provider,
    model,
    wasFallback,
    requiresUserConfirmation: confidence !== "high" || uncertainItems.length > 0,
    uncertainItems,
  };
}
