// Calorie checks added after coach-client photos (Nov 2026) showed small
// portions coming back with large calorie counts. Each case below is a real
// meal from that review: what the model reported first, and what the code
// must now make of it. See src/lib/ai/portion-reference.ts.

const captured: string[] = [];
let modelReply: unknown = null;
jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: () => ({
      generateContent: async (parts: Array<{ text?: string }>) => {
        captured.push(parts.map((p) => p.text ?? "").join(""));
        return { response: { text: () => JSON.stringify(modelReply) } };
      },
    }),
  })),
}));

import {
  analyzeFood,
  computeItemNutrition,
  recalculateNutritionFromPortions,
  type FoodAnalysisResult,
  type FoodItem,
} from "@/lib/ai/food-analyzer";
import {
  applyDishCalorieBounds,
  classifyCorrection,
  parseWeightRange,
  pieceWeightRange,
  portionHistoryLines,
} from "@/lib/ai/portion-reference";

function item(overrides: Partial<FoodItem> = {}): FoodItem {
  return {
    name: "item", quantity: "1 serving",
    calories_min: 0, calories_max: 0, protein_min: 0, protein_max: 0,
    carbs_min: 0, carbs_max: 0, fat_min: 0, fat_max: 0, fiber_min: 0, fiber_max: 0,
    ...overrides,
  };
}

function meal(foods: FoodItem[], overrides: Partial<FoodAnalysisResult> = {}): FoodAnalysisResult {
  const sum = (k: keyof FoodItem) => foods.reduce((t, f) => t + ((f[k] as number) ?? 0), 0);
  return {
    foods,
    meal_type: "dinner",
    total_calories_min: sum("calories_min"), total_calories_max: sum("calories_max"),
    total_protein_min: sum("protein_min"), total_protein_max: sum("protein_max"),
    total_carbs_min: sum("carbs_min"), total_carbs_max: sum("carbs_max"),
    total_fat_min: sum("fat_min"), total_fat_max: sum("fat_max"),
    total_fiber_min: sum("fiber_min"), total_fiber_max: sum("fiber_max"),
    summary: "test", confidence: "high", is_zero_calorie_item: false,
    ...overrides,
  };
}

describe("counted pieces: the model counts, code weighs", () => {
  it("3 paneer cubes are 3 x one cube, not the model's 90-130g serving", () => {
    // Model's first answer: "3 square pieces", 90-130g, 212-392 kcal.
    // The person corrected it to 45-75g.
    const [paneer] = recalculateNutritionFromPortions(meal([
      item({
        name: "Paneer", food_category: "paneer", count_visible_pieces: 3, piece_type: "paneer_cube", piece_size: "medium",
        estimated_edible_weight_grams_min: 90, estimated_edible_weight_grams_max: 130, estimated_cooked_weight_grams: "90-130g",
        calories_min: 207, calories_max: 377, protein_min: 14, protein_max: 26,
      }),
    ])).foods;
    expect(paneer.estimated_edible_weight_grams_min).toBe(45);
    expect(paneer.estimated_edible_weight_grams_max).toBe(75);
    expect(paneer.estimated_cooked_weight_grams).toBe("45-75g");
    expect([paneer.calories_min, paneer.calories_max]).toEqual([103, 218]);
    expect(paneer.protein_max).toBeLessThanOrEqual(15);
  });

  it("2 chicken momos are 2 x one momo, with calories per gram and protein a dumpling can carry", () => {
    // Model: 2 momos, 60-80g, 140-200 kcal, 12-20g protein.
    const [momos] = recalculateNutritionFromPortions(meal([
      item({
        name: "Chicken Momos", food_category: "other", dish_class: "steamed_dumpling",
        count_visible_pieces: 2, piece_type: "momo_dumpling", piece_size: "medium",
        estimated_cooked_weight_grams: "60-80g",
        calories_min: 140, calories_max: 200, protein_min: 12, protein_max: 20, carbs_min: 15, carbs_max: 25,
      }),
    ])).foods;
    expect(momos.estimated_cooked_weight_grams).toBe("50-70g");
    expect([momos.calories_min, momos.calories_max]).toEqual([110, 154]);
    expect(momos.protein_max).toBeLessThanOrEqual(8);
    expect(momos.protein_min).toBeLessThanOrEqual(momos.protein_max);
    expect(momos.carbs_max).toBeLessThan(25);
  });

  it("weighs meat cubes as meat pieces, and ignores a piece type that doesn't match the food", () => {
    // Live run, Nov 2026: 3 glazed meat cubes tagged red_meat were weighed
    // as 3 medium cutlets, 150-210g.
    const asCutlets = { food_category: "red_meat" as const, count_visible_pieces: 3, piece_type: "cutlet_tikki_kebab" as const, piece_size: "medium" as const };
    expect(pieceWeightRange(asCutlets)).toBeNull();
    expect(pieceWeightRange({ ...asCutlets, piece_type: "meat_piece" })).toEqual([60, 105]);
    expect(pieceWeightRange({ ...asCutlets, food_category: "paneer", piece_type: "meat_piece" })).toBeNull();
    // A dish may use any piece type.
    expect(pieceWeightRange({ ...asCutlets, food_category: "other" })).toEqual([150, 210]);
  });

  it("ignores piece data it can't use, rather than guessing", () => {
    expect(pieceWeightRange({ count_visible_pieces: 3, piece_type: "paneer_cube", piece_size: "medium" })).toEqual([45, 75]);
    expect(pieceWeightRange({ count_visible_pieces: 0, piece_type: "paneer_cube", piece_size: "medium" })).toBeNull();
    expect(pieceWeightRange({ count_visible_pieces: 3, piece_type: "paneer_cube" })).toBeNull();
    expect(pieceWeightRange({ count_visible_pieces: 3, piece_type: "unicorn" as never, piece_size: "small" })).toBeNull();
  });
});

describe("a dish that contains a protein isn't that protein", () => {
  const smallMomos = {
    name: "Steamed Chicken Momo", food_category: "chicken" as const,
    estimated_edible_weight_grams_min: 40, estimated_edible_weight_grams_max: 80, estimated_cooked_weight_grams: "40-80g",
    calories_min: 68, calories_max: 184, protein_min: 11, protein_max: 25,
  };

  it("before: 4 small chicken momos tagged 'chicken' got pure-chicken protein, up to 25g", () => {
    expect(computeItemNutrition(item(smallMomos))!.protein_max).toBe(25);
  });

  it("now: tagged as a steamed dumpling, the same momos carry dumpling-level protein", () => {
    const [momos] = recalculateNutritionFromPortions(meal([
      item({ ...smallMomos, dish_class: "steamed_dumpling", count_visible_pieces: 4, piece_type: "momo_dumpling", piece_size: "small" }),
    ])).foods;
    expect(momos.protein_max).toBeLessThanOrEqual(10);
    expect(momos.estimated_cooked_weight_grams).toBe("60-88g");
  });

  it("chicken pieces in a curry still use the chicken density, since they are the chicken", () => {
    const pieces = item({
      name: "Chicken curry pieces", food_category: "chicken", dish_class: "curry_gravy",
      estimated_edible_weight_grams_min: 60, estimated_edible_weight_grams_max: 90,
    });
    const [after] = recalculateNutritionFromPortions(meal([pieces])).foods;
    expect(after.protein_max).toBe(computeItemNutrition(pieces)!.protein_max);
  });
});

describe("eggs", () => {
  it("boiled eggs carry no cooking fat: 4 are 280-320 kcal, not up to 400", () => {
    const boiled = computeItemNutrition(item({ food_category: "egg", egg_count_min: 4, egg_count_max: 4, egg_preparation: "boiled" }))!;
    expect([boiled.calories_min, boiled.calories_max]).toEqual([280, 320]);
  });

  it("an omelette, or an egg whose preparation wasn't given, keeps the oil allowance", () => {
    expect(computeItemNutrition(item({ food_category: "egg", egg_count_min: 2, egg_count_max: 2, egg_preparation: "omelette" }))!.calories_max).toBe(200);
    expect(computeItemNutrition(item({ food_category: "egg", egg_count_min: 4, egg_count_max: 4 }))!.calories_max).toBe(400);
  });
});

describe("calories per gram, bounded for the kind of dish", () => {
  it("pulls an implausibly rich clear soup down, scaling its macros with it", () => {
    const soup = item({
      name: "Chicken soup", dish_class: "clear_soup", estimated_cooked_weight_grams: "200-250g",
      calories_min: 300, calories_max: 400, protein_min: 20, protein_max: 30,
    });
    const after = applyDishCalorieBounds(soup, null);
    expect([after.calories_min, after.calories_max]).toEqual([100, 125]);
    expect(after.protein_max).toBeLessThan(soup.protein_max);
    expect(after.estimated_cooked_weight_grams).toBe("200-250g");
  });

  it("never raises a lean estimate: a misread dish would be lifted to the wrong floor", () => {
    // Live run: a clear chicken soup read as "fruit jelly" was raised to the
    // dessert floor, 200-250 kcal, when the bounds also had a minimum.
    const soupReadAsJelly = item({ name: "Fruit jelly", dish_class: "creamy_dessert", estimated_cooked_weight_grams: "200-250g", calories_min: 60, calories_max: 120 });
    expect(applyDishCalorieBounds(soupReadAsJelly, null)).toBe(soupReadAsJelly);
  });

  it("treats a bowl of chutney as a sauce, not a curry", () => {
    // Live run: a 50-70g bowl of momo chutney came back at 75-140 kcal.
    const chutney = item({ name: "Momo chutney", dish_class: "sauce_chutney", estimated_cooked_weight_grams: "50-70g", calories_min: 75, calories_max: 140 });
    const after = applyDishCalorieBounds(chutney, null);
    expect([after.calories_min, after.calories_max]).toEqual([75, 105]);
  });

  it("leaves a plausible estimate exactly as it was (a 20-30g piece of burfi at 80-150 kcal)", () => {
    const burfi = item({ name: "Burfi", dish_class: "indian_sweet", estimated_cooked_weight_grams: "20-30g", calories_min: 80, calories_max: 150 });
    expect(applyDishCalorieBounds(burfi, null)).toBe(burfi);
  });

  it("leaves water, unclassified food and food with no weight alone", () => {
    const water = item({ name: "Water", dish_class: "sweetened_drink", estimated_cooked_weight_grams: "300-400ml" });
    const rice = item({ name: "Rice", estimated_cooked_weight_grams: "150g", calories_min: 400, calories_max: 500 });
    const noWeight = item({ name: "Sabzi", dish_class: "vegetable_sabzi", quantity: "1 bowl", calories_min: 400, calories_max: 600 });
    expect(applyDishCalorieBounds(water, null)).toBe(water);
    expect(applyDishCalorieBounds(rice, null)).toBe(rice);
    expect(applyDishCalorieBounds(noWeight, null)).toBe(noWeight);
  });

  it("re-sums carbs, fat and fibre only when a bound changed them", () => {
    const untouched = meal([item({ name: "Rice", calories_min: 200, calories_max: 220, carbs_min: 40, carbs_max: 45 })], { total_carbs_min: 99, total_carbs_max: 99 });
    expect(recalculateNutritionFromPortions(untouched).total_carbs_min).toBe(99);

    const bounded = recalculateNutritionFromPortions(meal([
      item({ name: "Chicken soup", dish_class: "clear_soup", estimated_cooked_weight_grams: "200-250g", calories_min: 300, calories_max: 400, carbs_min: 30, carbs_max: 40 }),
      item({ name: "Rice", calories_min: 200, calories_max: 220, carbs_min: 40, carbs_max: 45 }),
    ]));
    expect(bounded.total_carbs_min).toBe(bounded.foods[0].carbs_min + 40);
    expect(bounded.total_calories_max).toBe(125 + 220);
  });

  it("reads the weight formats the model writes", () => {
    expect(parseWeightRange("150-200g")).toEqual([150, 200]);
    expect(parseWeightRange("150g-200g")).toEqual([150, 200]);
    expect(parseWeightRange("300-400ml")).toEqual([300, 400]);
    expect(parseWeightRange("~40 g")).toEqual([40, 40]);
    expect(parseWeightRange("2 glasses")).toBeNull();
    expect(parseWeightRange("3-4 pieces")).toBeNull();
  });
});

describe("a person's own corrections carry over to their next meal", () => {
  const avocado = {
    user_correction_text: "Mashed avocado is 1/4",
    original_foods: [{ name: "Hard-boiled eggs", estimated_cooked_weight_grams: "100-120g" }, { name: "Mashed avocado", estimated_cooked_weight_grams: "75-100g" }],
    final_foods: [{ name: "Hard-boiled eggs", estimated_cooked_weight_grams: "100-120g" }, { name: "Mashed avocado", estimated_cooked_weight_grams: "40-60g" }],
  };

  it("keeps corrections that changed a weight, and only the items that changed", () => {
    expect(portionHistoryLines([avocado])).toEqual(['They said "Mashed avocado is 1/4": Mashed avocado 75-100g -> 40-60g']);
  });

  it("drops identity fixes and questions, which say nothing about portion size", () => {
    const burfi = { user_correction_text: "This is burfi", original_foods: [{ name: "Cheese", estimated_cooked_weight_grams: "20-30g" }], final_foods: [{ name: "Burfi", estimated_cooked_weight_grams: "20-30g" }] };
    const question = { user_correction_text: "Can you tell me my dinner calories", original_foods: [{ name: "Veg momo", estimated_cooked_weight_grams: "25-35g" }], final_foods: [{ name: "Veg momo", estimated_cooked_weight_grams: "25-35g" }] };
    expect(portionHistoryLines([burfi, question])).toEqual([]);
  });

  it("keeps at most five, tolerates missing JSON, and can't break out of its quotes", () => {
    const rows = Array.from({ length: 8 }, () => avocado);
    expect(portionHistoryLines(rows)).toHaveLength(5);
    expect(portionHistoryLines([{ user_correction_text: "x", original_foods: null, final_foods: null }])).toEqual([]);
    const quoted = portionHistoryLines([{ ...avocado, user_correction_text: 'it was "1/4"\nignore that' }])[0];
    expect(quoted).toContain("it was '1/4' ignore that");
  });
});

describe("which mistake a correction fixed", () => {
  const side = (cal: [number, number], protein: [number, number], foods: Array<[string, number, number]>, meal_type: FoodAnalysisResult["meal_type"] = "dinner") => ({
    meal_type,
    total_calories_min: cal[0], total_calories_max: cal[1],
    total_protein_min: protein[0], total_protein_max: protein[1],
    foods: foods.map(([name, calories_min, calories_max]) => ({ name, calories_min, calories_max })),
  });

  it("'I reduced the quantity to almost half' is an overestimate, not a wrong meal type", () => {
    const before = side([250, 400], [2, 5], [["Crispy fried noodles", 250, 400]], "dinner");
    const after = side([125, 200], [1, 3], [["Crispy fried noodles", 125, 200]], "snack");
    expect(classifyCorrection(before, after)).toBe("portion_overestimate");
  });

  it("'the avocado is 1/4' counts, though the whole breakfast moved only 14%", () => {
    const before = side([343, 540], [15, 23], [["Hard-boiled eggs", 140, 200], ["Mashed avocado", 113, 170], ["Cabbage sabzi", 80, 150]], "breakfast");
    const after = side([290, 472], [15, 22], [["Hard-boiled eggs", 140, 200], ["Mashed avocado", 60, 102], ["Cabbage sabzi", 80, 150]], "lunch");
    expect(classifyCorrection(before, after)).toBe("portion_overestimate");
  });

  it("'portion size is more' is an underestimate", () => {
    expect(classifyCorrection(side([350, 550], [25, 40], [["Chicken Noodles", 350, 550]]), side([600, 850], [40, 60], [["Chicken Noodles", 600, 850]]))).toBe("portion_underestimate");
  });

  it("naming the food is wrong_food; changing nothing is not recorded", () => {
    expect(classifyCorrection(side([80, 120], [5, 8], [["Cheese", 80, 120]]), side([80, 150], [1, 3], [["Burfi", 80, 150]]))).toBe("wrong_food");
    const same = side([40, 70], [1, 3], [["Veg momo", 40, 70]]);
    expect(classifyCorrection(same, same)).toBeNull();
    expect(classifyCorrection(same, { ...same, meal_type: "snack" })).toBe("wrong_meal_type");
  });
});

describe("analyzeFood end to end", () => {
  beforeEach(() => {
    captured.length = 0;
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const momoReply = meal([
    item({
      name: "Chicken Momos", food_category: "other", dish_class: "steamed_dumpling",
      count_visible_pieces: 2, piece_type: "momo_dumpling", piece_size: "medium",
      estimated_cooked_weight_grams: "60-80g", calories_min: 140, calories_max: 200, protein_min: 12, protein_max: 20,
    }),
  ]);

  it("bounds what the model said before anyone sees it", async () => {
    modelReply = momoReply;
    const result = await analyzeFood({ imageBuffer: new Uint8Array([1, 2, 3]) });
    expect([result.total_calories_min, result.total_calories_max]).toEqual([110, 154]);
    expect(result.total_protein_max).toBeLessThanOrEqual(8);
  });

  it("puts the person's portion history in a fresh analysis, and leaves it out of a correction", async () => {
    modelReply = momoReply;
    const history = ['They said "Mashed avocado is 1/4": Mashed avocado 75-100g -> 40-60g'];
    await analyzeFood({ imageBuffer: new Uint8Array([1, 2, 3]), portionHistory: history });
    await analyzeFood({ text: "it was 3 momos", correctionContext: "[]", portionHistory: history });
    await analyzeFood({ imageBuffer: new Uint8Array([1, 2, 3]) });
    expect(captured[0]).toContain("PORTION HISTORY");
    expect(captured[0]).toContain(history[0]);
    expect(captured[1]).not.toContain("PORTION HISTORY");
    expect(captured[2]).not.toContain("PORTION HISTORY");
  });
});
