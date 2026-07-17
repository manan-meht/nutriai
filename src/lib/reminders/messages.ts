// One pool per meal slot rather than a single fixed message, so someone on
// all 3 default reminder times (8am/12pm/7pm) doesn't see the exact same
// wording three times a day, every day. Slot is inferred from the
// reminder's own "HH:MM" time rather than position in reminder_times
// (which is user-editable and not guaranteed to be exactly 3 entries in
// breakfast/lunch/dinner order).

const BREAKFAST_MESSAGES = [
  (name: string) => `Good morning, ${name}! 🌅 Had breakfast yet? Send a quick photo when you do.`,
  (name: string) => `Morning, ${name}! ☀️ A quick photo of your breakfast keeps your streak going.`,
  (name: string) => `Hey ${name}, rise and shine! 🍳 Don't forget to snap your breakfast when you eat.`,
  (name: string) => `Good morning! 👋 What's for breakfast today, ${name}? Send us a photo!`,
  (name: string) => `Morning nudge from Tistra Health 🌅 — breakfast photo whenever you're ready, ${name}.`,
  (name: string) => `Hi ${name}! Starting the day right? Share your breakfast with a quick photo. 🍽️`,
  (name: string) => `Good morning, ${name}! A little breakfast update goes a long way. 📸`,
];

const LUNCH_MESSAGES = [
  (name: string) => `Hi ${name}! 🍽️ Lunchtime check-in — send a photo when you eat.`,
  (name: string) => `Hey ${name}, hope lunch is good today! Don't forget to share a quick photo. 😊`,
  (name: string) => `Midday nudge, ${name} — what's on your plate for lunch? 🥗`,
  (name: string) => `Hi ${name}! Just a friendly reminder to log your lunch when you get a chance.`,
  (name: string) => `Lunch break, ${name}? Snap a quick photo so we can keep track. 📸`,
  (name: string) => `Hey ${name}, how's lunch going? A quick photo helps us keep your trend up to date.`,
  (name: string) => `Hi ${name}! 🍛 Whenever you eat lunch, send us a photo — takes just a second.`,
];

const DINNER_MESSAGES = [
  (name: string) => `Evening, ${name}! 🌙 Send a photo of dinner whenever you're ready.`,
  (name: string) => `Hey ${name}, hope dinner's good tonight! Don't forget to share a quick photo. 🍽️`,
  (name: string) => `Hi ${name}! Winding down for the day — log your dinner when you can. 😊`,
  (name: string) => `Dinnertime nudge, ${name} — a quick photo keeps your week complete. 🌆`,
  (name: string) => `Hey ${name}! What's for dinner tonight? Snap a photo when you eat.`,
  (name: string) => `Evening check-in, ${name} 🌙 — share your dinner whenever you get a moment.`,
];

export type MealSlot = "breakfast" | "lunch" | "dinner";

/** Buckets a reminder's "HH:MM" time into a meal slot. Boundaries chosen to
 * comfortably contain the default 8am/12pm/7pm times with room for
 * per-contact customization on either side. */
export function mealSlotForTime(reminderTime: string): MealSlot {
  const hour = Number(reminderTime.split(":")[0]);
  if (hour < 11) return "breakfast";
  if (hour < 17) return "lunch";
  return "dinner";
}

function poolForSlot(slot: MealSlot): Array<(name: string) => string> {
  switch (slot) {
    case "breakfast":
      return BREAKFAST_MESSAGES;
    case "lunch":
      return LUNCH_MESSAGES;
    case "dinner":
      return DINNER_MESSAGES;
  }
}

export function buildReminderMessage(firstName: string, reminderTime: string): string {
  const pool = poolForSlot(mealSlotForTime(reminderTime));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return pick(firstName);
}

/** For an elderly parent in India, "Uncle"/"Aunty" reads as more natural
 * and respectful in reminder messages than a first name — a common
 * convention there. Deliberately narrow: only adults contacts (gym_clients
 * has no `relationship` field), relationship exactly "parent", age over
 * 60, and an Indian number (+91). Falls back to first name whenever any
 * condition doesn't hold, or gender is unset/"other" (no natural
 * uncle/aunty mapping for that case). */
export function reminderDisplayName(opts: {
  fullName: string;
  relationship?: string | null;
  age?: number | null;
  gender?: string | null;
  normalizedWhatsappNumber: string;
}): string {
  const { fullName, relationship, age, gender, normalizedWhatsappNumber } = opts;
  const firstName = fullName.split(" ")[0];

  const isElderlyIndianParent =
    relationship === "parent" && typeof age === "number" && age > 60 && normalizedWhatsappNumber.startsWith("91");

  if (!isElderlyIndianParent) return firstName;
  if (gender === "male") return "Uncle";
  if (gender === "female") return "Aunty";
  return firstName;
}
