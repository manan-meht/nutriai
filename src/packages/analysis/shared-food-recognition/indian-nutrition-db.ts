/**
 * Indian Nutrition Database (INDB) lookup layer.
 *
 * The INDB (ICMR-NIN) covers ~500 common Indian foods with per-100g
 * macronutrient values. This module provides fuzzy lookup so that foods
 * identified by the AI can be matched to a canonical nutrition entry.
 *
 * In production: replace SEED_FOODS with a Supabase table query against
 * an `indb_foods` table seeded from the ICMR-NIN dataset.
 */

export interface IndbFood {
  code: string;
  name: string;
  nameLocal?: string;
  category: string;
  per100g: {
    calories: number;
    proteinGrams: number;
    carbohydratesGrams: number;
    fatGrams: number;
    fibreGrams: number;
  };
}

// Representative seed data — expand from ICMR-NIN dataset
const SEED_FOODS: IndbFood[] = [
  {
    code: "INDB-001",
    name: "Dal (Toor/Arhar, cooked)",
    nameLocal: "तुअर दाल",
    category: "Legumes",
    per100g: { calories: 116, proteinGrams: 7.2, carbohydratesGrams: 20.7, fatGrams: 0.5, fibreGrams: 2.3 },
  },
  {
    code: "INDB-002",
    name: "Steamed Rice (cooked)",
    nameLocal: "चावल",
    category: "Cereals",
    per100g: { calories: 130, proteinGrams: 2.7, carbohydratesGrams: 28.2, fatGrams: 0.3, fibreGrams: 0.2 },
  },
  {
    code: "INDB-003",
    name: "Roti / Chapati (whole wheat)",
    nameLocal: "रोटी",
    category: "Cereals",
    per100g: { calories: 297, proteinGrams: 9.8, carbohydratesGrams: 56.8, fatGrams: 3.5, fibreGrams: 3.5 },
  },
  {
    code: "INDB-004",
    name: "Paneer",
    nameLocal: "पनीर",
    category: "Dairy",
    per100g: { calories: 265, proteinGrams: 18.3, carbohydratesGrams: 3.6, fatGrams: 20.8, fibreGrams: 0 },
  },
  {
    code: "INDB-005",
    name: "Sabzi (mixed vegetable, cooked)",
    nameLocal: "सब्ज़ी",
    category: "Vegetables",
    per100g: { calories: 65, proteinGrams: 2.1, carbohydratesGrams: 8.4, fatGrams: 2.8, fibreGrams: 1.9 },
  },
  {
    code: "INDB-006",
    name: "Idli (steamed)",
    nameLocal: "इडली",
    category: "Cereals",
    per100g: { calories: 132, proteinGrams: 3.9, carbohydratesGrams: 25.8, fatGrams: 1.2, fibreGrams: 0.8 },
  },
  {
    code: "INDB-007",
    name: "Sambar",
    nameLocal: "सांबर",
    category: "Legumes",
    per100g: { calories: 45, proteinGrams: 2.5, carbohydratesGrams: 7.2, fatGrams: 0.9, fibreGrams: 1.5 },
  },
  {
    code: "INDB-008",
    name: "Poha (flattened rice, cooked)",
    nameLocal: "पोहा",
    category: "Cereals",
    per100g: { calories: 130, proteinGrams: 2.5, carbohydratesGrams: 27.0, fatGrams: 1.8, fibreGrams: 0.5 },
  },
  {
    code: "INDB-009",
    name: "Chicken Curry",
    nameLocal: "चिकन करी",
    category: "Meat",
    per100g: { calories: 155, proteinGrams: 14.2, carbohydratesGrams: 5.3, fatGrams: 8.8, fibreGrams: 0.4 },
  },
  {
    code: "INDB-010",
    name: "Dal Makhani",
    nameLocal: "दाल मखनी",
    category: "Legumes",
    per100g: { calories: 132, proteinGrams: 7.4, carbohydratesGrams: 15.2, fatGrams: 5.1, fibreGrams: 3.2 },
  },
  {
    code: "INDB-011",
    name: "Egg (boiled)",
    nameLocal: "अंडा",
    category: "Egg",
    per100g: { calories: 155, proteinGrams: 13.0, carbohydratesGrams: 1.1, fatGrams: 11.0, fibreGrams: 0 },
  },
  {
    code: "INDB-012",
    name: "Curd / Dahi",
    nameLocal: "दही",
    category: "Dairy",
    per100g: { calories: 60, proteinGrams: 3.1, carbohydratesGrams: 4.7, fatGrams: 3.1, fibreGrams: 0 },
  },
  {
    code: "INDB-013",
    name: "Moong Dal (cooked)",
    nameLocal: "मूंग दाल",
    category: "Legumes",
    per100g: { calories: 104, proteinGrams: 7.0, carbohydratesGrams: 17.7, fatGrams: 0.7, fibreGrams: 1.8 },
  },
  {
    code: "INDB-014",
    name: "Upma",
    nameLocal: "उपमा",
    category: "Cereals",
    per100g: { calories: 119, proteinGrams: 2.8, carbohydratesGrams: 18.4, fatGrams: 4.0, fibreGrams: 0.8 },
  },
  {
    code: "INDB-015",
    name: "Rajma (kidney beans, cooked)",
    nameLocal: "राजमा",
    category: "Legumes",
    per100g: { calories: 127, proteinGrams: 8.7, carbohydratesGrams: 22.8, fatGrams: 0.5, fibreGrams: 6.4 },
  },
];

export type IndbLookupResult = {
  food: IndbFood;
  confidence: "high" | "medium" | "low";
  matchedOn: string;
} | null;

export function lookupIndb(foodName: string): IndbLookupResult {
  const query = foodName.toLowerCase().trim();

  for (const food of SEED_FOODS) {
    if (food.name.toLowerCase() === query) {
      return { food, confidence: "high", matchedOn: "exact" };
    }
  }

  for (const food of SEED_FOODS) {
    if (food.name.toLowerCase().includes(query) || query.includes(food.name.toLowerCase().split(" ")[0])) {
      return { food, confidence: "medium", matchedOn: "partial" };
    }
  }

  // Token match — any word in the food name matches
  const queryTokens = query.split(/\s+/);
  for (const food of SEED_FOODS) {
    const nameTokens = food.name.toLowerCase().split(/\s+/);
    if (queryTokens.some((qt) => nameTokens.some((nt) => nt.startsWith(qt) && qt.length >= 3))) {
      return { food, confidence: "low", matchedOn: "token" };
    }
  }

  return null;
}

export function estimateNutritionFromIndb(
  food: IndbFood,
  quantityGrams: number
): {
  calories: number;
  proteinGrams: number;
  carbohydratesGrams: number;
  fatGrams: number;
  fibreGrams: number;
} {
  const factor = quantityGrams / 100;
  return {
    calories: Math.round(food.per100g.calories * factor),
    proteinGrams: Math.round(food.per100g.proteinGrams * factor * 10) / 10,
    carbohydratesGrams: Math.round(food.per100g.carbohydratesGrams * factor * 10) / 10,
    fatGrams: Math.round(food.per100g.fatGrams * factor * 10) / 10,
    fibreGrams: Math.round(food.per100g.fibreGrams * factor * 10) / 10,
  };
}
