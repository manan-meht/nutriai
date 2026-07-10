// Unit tests for classifyPendingReply (src/lib/whatsapp/conversation-handler.ts)
// — the priority-ordered intent classifier for replies to a pending meal
// estimate: confirm > discard > ambiguous bare negative > vague correction
// signal > correction. Covers the exact cases from the "no" mishandling
// bug report: a bare "no" must not be treated as a discard, and a
// correction phrased with a leading "no" must not be treated as a discard
// either — only an unambiguous discard phrase, or a bare negative on its
// own, should take those paths.

import { classifyPendingReply } from "@/lib/whatsapp/conversation-handler";

describe("classifyPendingReply", () => {
  describe("confirmation intent", () => {
    it.each(["yes", "yes save", "save", "log it", "correct, save it", "looks right"])(
      "%s -> confirm",
      (text) => expect(classifyPendingReply(text)).toBe("confirm")
    );
  });

  describe("explicit discard intent", () => {
    it.each([
      "skip", "cancel", "discard", "don't save", "dont save", "do not save",
      "don't record", "dont record", "no need to record", "no need to log",
      "no need to save", "ignore this", "leave it", "nothing to save",
      "don't log this", "dont log this", "no need", "not recording this",
      "nothing. No need to record anything",
    ])("%s -> discard", (text) => expect(classifyPendingReply(text)).toBe("discard"));
  });

  describe("correction intent, including ones that contain the word 'no'", () => {
    it.each([
      "No, this is not chicken. This is fish.",
      "No, it's paneer, not tofu.",
      "Not chicken, fish.",
      "This is fish.",
      "Actually this is fish.",
      "This was only 3 small pieces of chicken.",
      "Remove avocado.",
      "Add 1 roti.",
      "Make this lunch.",
      "Change to dinner.",
      "Only 1 egg.",
      "It's not wine, it's tea.",
      "Rice was half cup.",
      "Chicken was less.",
      "More avocado.",
      "Less rice.",
    ])("%s -> correction", (text) => expect(classifyPendingReply(text)).toBe("correction"));
  });

  describe("ambiguous bare negative", () => {
    it.each(["no", "nope", "nah", "no thanks", "No.", "NOPE"])(
      "%s -> ambiguous_negative",
      (text) => expect(classifyPendingReply(text)).toBe("ambiguous_negative")
    );
  });

  describe("vague correction signal", () => {
    it.each(["wrong", "change", "edit"])(
      "%s -> vague_correction",
      (text) => expect(classifyPendingReply(text)).toBe("vague_correction")
    );
  });

  it("never classifies a substantive correction beginning with 'no,' as discard or ambiguous", () => {
    // The exact regression case: this must not be discard (no explicit
    // discard phrase) and must not be ambiguous (it's not a BARE negative
    // — there's a full sentence after it).
    const result = classifyPendingReply("No, this is not chicken. This is fish.");
    expect(result).not.toBe("discard");
    expect(result).not.toBe("ambiguous_negative");
    expect(result).toBe("correction");
  });
});
