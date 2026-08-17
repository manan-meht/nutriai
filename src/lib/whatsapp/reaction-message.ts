// The WhatsApp line a contact receives when their caregiver reacts to a
// meal. Pure and separately testable; the send itself happens in the
// reactToMeal server action.
//
// Tone rules: short, warm, names the specific meal (being seen for THIS
// meal is the whole point), never evaluates the food — a reaction is
// attention, not judgment, so the copy must work equally for dal and for
// cake.

const EMOJI_VERB: Record<string, string> = {
  "👍": "sent you a 👍",
  "🎉": "sent you a 🎉",
  "❤️": "sent you a ❤️",
};

export function buildReactionMessage(input: {
  caregiverName: string;
  /** e.g. "lunch", "breakfast" — already lowercased meal label. */
  mealLabel: string;
  emoji: string;
}): string {
  const verb = EMOJI_VERB[input.emoji] ?? `sent you a ${input.emoji}`;
  return `${input.caregiverName} saw your ${input.mealLabel} and ${verb} 😊`;
}
