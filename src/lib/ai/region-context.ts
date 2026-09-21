// What the food analyzer should expect to see, by where the person lives.
//
// The vision prompt was written for Indian food and said so in its first
// line; every portion heuristic, example and nudge assumed dal, roti and
// paneer. That was right for most people and wrong for everyone else: a
// Singapore user reported hawker, Chinese and Japanese meals going
// unrecognised. The only signal we hold about where someone eats is the
// contact's timezone, which (since the country-code default) is usually
// right — so it picks the region here, and the region supplies the dish
// vocabulary the model should reach for, the protein foods the nudges name,
// and the example a clarification asks for.
//
// Indian food stays in every region's context: diaspora meals are common
// everywhere, and the point is to add local cuisine, not swap one bias for
// another.

export interface RegionContext {
  /** Short human name, used in logs and tests. */
  name: string;
  /** Prompt paragraph: the dishes and conventions to expect. */
  cuisineNote: string;
  /** Protein foods to suggest in nudges, in the person's own food language. */
  proteinExamples: string;
  /** A plausible meal for the "could you describe it?" example. */
  mealExample: string;
}

const SOUTH_ASIA: RegionContext = {
  name: "South Asia",
  cuisineNote:
    "Expect Indian and South Asian home cooking: dal, sabzi, roti/chapati/paratha, rice, curries, paneer, idli/dosa/sambar, upma, poha, khichdi, biryani, curd/raita, and snacks like samosa, pakora and chaat. Use katori/roti/cup portion conventions.",
  proteinExamples: "dal, eggs, paneer, chicken, fish",
  mealExample: "rice, dal, and sabzi",
};

const SINGAPORE_MALAYSIA: RegionContext = {
  name: "Singapore/Malaysia",
  cuisineNote:
    "Expect Singapore and Malaysian hawker and home food alongside Chinese, Malay, Indian, Japanese, Korean and Western meals: chicken rice, laksa, char kway teow, bak chor mee, fishball noodles, wanton mee, hokkien mee, nasi lemak, roti prata, mee rebus, mee siam, yong tau foo, cai fan (economy rice: rice with 2-3 chosen dishes), bak kut teh, kaya toast with soft-boiled eggs, satay, dim sum, congee, sushi, ramen, bento. Name dishes by their local names. A standard hawker plate or bowl is roughly 350-450g cooked; a small bowl of noodle soup 250-300g.",
  proteinExamples: "tofu, fish, eggs, chicken, tempeh, edamame",
  mealExample: "chicken rice with soup",
};

const THAILAND: RegionContext = {
  name: "Thailand",
  cuisineNote:
    "Expect Thai home and street food alongside Chinese, Japanese and Western meals: khao man gai, pad kra pao with a fried egg, som tam, tom yum, pad thai, green/red curry with rice, khao pad, boat noodles, khao soi, mango sticky rice. Name dishes by their Thai names. A street-stall plate of rice with one dish is roughly 300-400g cooked.",
  proteinExamples: "tofu, eggs, chicken, fish, pork",
  mealExample: "khao man gai",
};

const PHILIPPINES: RegionContext = {
  name: "Philippines",
  cuisineNote:
    "Expect Filipino home food and rice meals alongside Chinese, Japanese and Western dishes: adobo, sinigang, tinola, kare-kare, pancit, lumpia, tapsilog and other -silog breakfasts, lechon, pandesal, halo-halo. Rice is served with most meals; a rice-meal plate is roughly 350-450g cooked.",
  proteinExamples: "eggs, chicken, fish, pork, tofu",
  mealExample: "chicken adobo with rice",
};

const INDONESIA: RegionContext = {
  name: "Indonesia",
  cuisineNote:
    "Expect Indonesian home and warung food: nasi goreng, nasi campur, gado-gado, tempeh and tahu, rendang, soto, sate, bakso, mie goreng, sambal. Name dishes by their Indonesian names.",
  proteinExamples: "tempeh, tofu, eggs, chicken, fish",
  mealExample: "nasi campur with tempeh",
};

const EAST_ASIA: RegionContext = {
  name: "East Asia",
  cuisineNote:
    "Expect Japanese (donburi, bento, sushi, ramen, udon, onigiri, miso soup, natto, grilled fish), Korean (bibimbap, kimchi jjigae, bulgogi, banchan) and Chinese (dim sum, congee, stir-fries, dumplings, noodle soups, hot pot) meals alongside Western food. Name dishes by their local names; bowls and bento compartments set the portion.",
  proteinExamples: "tofu, fish, eggs, chicken, natto, edamame",
  mealExample: "chicken teriyaki bento",
};

const GULF: RegionContext = {
  name: "Gulf",
  cuisineNote:
    "Expect Middle Eastern and Gulf food (shawarma, hummus, falafel, grilled meats, machboos/kabsa, manakish, labneh, dates) alongside a large South Asian diaspora eating Indian and Pakistani home food.",
  proteinExamples: "eggs, chicken, fish, lentils, labneh, paneer",
  mealExample: "grilled chicken with rice and salad",
};

const WESTERN: RegionContext = {
  name: "Western/mixed",
  cuisineNote:
    "Expect Western everyday meals (sandwiches, salads, pasta, wraps, grain bowls, eggs on toast, cereal and yoghurt, roast dinners, takeaway pizza or burgers) alongside Indian and other diaspora home cooking. Name dishes plainly; plates and containers set the portion.",
  proteinExamples: "eggs, chicken, fish, beans, lentils, Greek yoghurt, tofu",
  mealExample: "chicken salad with a bread roll",
};

const BY_TIMEZONE: Array<[RegExp, RegionContext]> = [
  [/^Asia\/(Singapore|Kuala_Lumpur|Kuching)$/, SINGAPORE_MALAYSIA],
  [/^Asia\/(Bangkok|Vientiane|Phnom_Penh)$/, THAILAND],
  [/^Asia\/Manila$/, PHILIPPINES],
  [/^Asia\/(Jakarta|Makassar|Jayapura)$/, INDONESIA],
  [/^Asia\/(Tokyo|Seoul|Shanghai|Hong_Kong|Taipei|Macau|Chongqing|Harbin)$/, EAST_ASIA],
  [/^Asia\/(Dubai|Qatar|Riyadh|Bahrain|Kuwait|Muscat)$/, GULF],
  [/^(Europe|America|Australia|Pacific|Africa|Atlantic)\//, WESTERN],
  [/^UTC$/, WESTERN],
];

/** The region for a contact's timezone. South Asia when the timezone is
 * unknown (gym clients have no timezone column) or unlisted — the
 * behaviour the prompt always had, so nothing regresses for the majority. */
export function regionContextForTimezone(timezone: string | null | undefined): RegionContext {
  if (!timezone) return SOUTH_ASIA;
  for (const [pattern, ctx] of BY_TIMEZONE) if (pattern.test(timezone)) return ctx;
  return SOUTH_ASIA;
}

/** The paragraph appended to the vision prompt. */
export function regionPromptSection(timezone: string | null | undefined): string {
  const ctx = regionContextForTimezone(timezone);
  return (
    `REGION — the person lives in the ${ctx.name} region (timezone ${timezone ?? "unknown"}). ${ctx.cuisineNote} ` +
    "Identify what is actually visible: do not assume an Indian dish or Indian serving sizes when the food clearly is not Indian, and do not assume a local dish when it clearly is. Use the region's own dish names in food names and the summary."
  );
}
