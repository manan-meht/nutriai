// A conversation must never come to REST in "processing".
//
// "processing" is the per-phone-number lock (see claimConversationLock),
// held across an AI call. Several exit paths persist whatever state they
// were handed — the greeting reply writes peekState back, and the
// nutrition-question and unreadable-photo paths release the lock
// "unchanged". Handed "processing", each of those wrote it back as a
// resting state, so every subsequent message reclaimed the stale lock, took
// one of those paths, and re-cemented the trap.
//
// A real user was stuck this way for three days: the bot replied to her
// greetings and logged nothing.
import { restingState } from "@/lib/whatsapp/conversation-handler";

describe("restingState", () => {
  it("never lets the transient lock become a resting state", () => {
    expect(restingState("processing")).toBe("idle");
  });

  it("leaves idle alone", () => {
    expect(restingState("idle")).toBe("idle");
  });

  it("preserves every in-flight state, so a greeting mid-flow keeps its pending meal", () => {
    // These are real resting points with a pending meal attached — the
    // fix must not flatten them, or answering a clarifying question after
    // saying "hi" would lose the meal it belongs to.
    for (const state of [
      "awaiting_confirmation",
      "awaiting_clarification",
      "awaiting_correction",
      "awaiting_correction_confirmation",
      "awaiting_skip_or_correction",
      "awaiting_edit_or_undo",
    ]) {
      expect(restingState(state)).toBe(state);
    }
  });
});
