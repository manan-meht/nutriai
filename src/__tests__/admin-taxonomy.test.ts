// Taxonomy changes from migration 0052 — driven by reviewer feedback after
// ~90 reviews. These guard the value lists against drifting away from the
// DB check constraints, which is how the review console and the knowledge
// base table got out of step in the first place.

import { readFileSync } from "fs";
import { join } from "path";
import {
  FOOD_CATEGORIES,
  FOOD_CATEGORY_LABELS,
  foodCategoryLabel,
  REVIEW_STATUS_OPTIONS,
  REVIEW_STATUS_LABELS,
  reviewStatusLabel,
  MICRONUTRIENT_STATUSES,
} from "@/lib/admin/food-categories";

const migration = readFileSync(
  join(__dirname, "..", "..", "supabase", "migrations", "0052_review_taxonomy_expansion.sql"),
  "utf8"
);

/** 0053 supersedes 0052's review_status constraint (it merged
 * unclear_photo into unclear_image), so verdicts are checked against it. */
const verdictMigration = readFileSync(
  join(__dirname, "..", "..", "supabase", "migrations", "0053_merge_unclear_review_statuses.sql"),
  "utf8"
);

describe("food categories", () => {
  it("offers graded fat sources", () => {
    expect(FOOD_CATEGORIES).toContain("fat_source_good");
    expect(FOOD_CATEGORIES).toContain("fat_source_poor");
  });

  it("keeps the pre-split fat_source so the 18 existing entries stay editable", () => {
    expect(FOOD_CATEGORIES).toContain("fat_source");
    expect(FOOD_CATEGORY_LABELS.fat_source).toMatch(/unsorted/i);
  });

  it("replaces enjoyment_food with treat_food", () => {
    expect(FOOD_CATEGORIES).toContain("treat_food");
    expect(FOOD_CATEGORIES).not.toContain("enjoyment_food");
  });

  it("labels every category, and never leaves a raw underscore visible", () => {
    for (const category of FOOD_CATEGORIES) {
      expect(FOOD_CATEGORY_LABELS[category]).toBeTruthy();
      expect(foodCategoryLabel(category)).not.toContain("_");
    }
  });

  it("de-underscores an unrecognised value rather than dropping it", () => {
    // The old inline `.replace("_", " ")` only replaced the FIRST underscore,
    // so a two-underscore value rendered as "fat source_good".
    expect(foodCategoryLabel("some_new_value")).toBe("some new value");
  });

  it("stays in step with the migration's check constraint", () => {
    for (const category of FOOD_CATEGORIES) {
      expect(migration).toContain(`'${category}'`);
    }
  });
});

describe("review verdicts", () => {
  it("adds the no-photo and unclear-image verdicts", () => {
    expect(REVIEW_STATUS_OPTIONS).toContain("no_photo");
    expect(REVIEW_STATUS_OPTIONS).toContain("unclear_image");
  });

  it("has a single unclear verdict — unclear_photo was merged away in 0053", () => {
    expect(REVIEW_STATUS_OPTIONS).toContain("unclear_image");
    expect(REVIEW_STATUS_OPTIONS).not.toContain("unclear_photo");
    expect(REVIEW_STATUS_LABELS.unclear_image).toBe("Unclear image");
  });

  it("keeps no_photo distinct — nothing submitted is not the same as unreadable", () => {
    expect(REVIEW_STATUS_OPTIONS).toContain("no_photo");
  });

  it("labels every verdict without a raw underscore", () => {
    for (const status of REVIEW_STATUS_OPTIONS) {
      expect(reviewStatusLabel(status)).toBeTruthy();
      expect(reviewStatusLabel(status)).not.toContain("_");
    }
  });

  it("stays in step with the migration's check constraint", () => {
    for (const status of REVIEW_STATUS_OPTIONS) {
      expect(verdictMigration).toContain(`'${status}'`);
    }
  });

  it("0053 rewrites the old rows rather than orphaning them", () => {
    expect(verdictMigration).toMatch(/update human_meal_reviews[\s\S]*unclear_image[\s\S]*unclear_photo/i);
  });
});

describe("micronutrient status", () => {
  it("uses the same four-value scale as the other presence fields", () => {
    expect([...MICRONUTRIENT_STATUSES].sort()).toEqual(["missing", "partial", "present", "unknown"]);
  });

  it("defaults to unknown, since neither the model nor the derivation produces it yet", () => {
    expect(MICRONUTRIENT_STATUSES[0]).toBe("unknown");
  });

  it("is added to both the AI classification and the human review", () => {
    expect(migration).toMatch(/ai_meal_classifications[\s\S]*micronutrient_status/);
    expect(migration).toMatch(/corrected_micronutrient_status/);
  });
});
