import { validateFeedbackSubmission, isSuspiciouslyFast, MIN_FILL_TIME_MS } from "@/lib/feedback/validate";
import { FEEDBACK_MESSAGE_MAX_LENGTH, FEEDBACK_MESSAGE_MIN_LENGTH, FEEDBACK_TYPE_OPTIONS } from "@/lib/feedback/types";

const validBase = {
  feedbackType: "general",
  message: "This is a perfectly reasonable message about the product.",
  source: "website",
};

describe("validateFeedbackSubmission — required-field validation", () => {
  it("accepts a valid submission", () => {
    expect(validateFeedbackSubmission(validBase)).toEqual({ ok: true });
  });

  it("rejects a missing/invalid feedback type", () => {
    expect(validateFeedbackSubmission({ ...validBase, feedbackType: undefined }).ok).toBe(false);
    expect(validateFeedbackSubmission({ ...validBase, feedbackType: "not-a-real-type" }).ok).toBe(false);
  });

  it("accepts every documented feedback type", () => {
    for (const { value } of FEEDBACK_TYPE_OPTIONS) {
      expect(validateFeedbackSubmission({ ...validBase, feedbackType: value })).toEqual({ ok: true });
    }
  });

  it("rejects a message shorter than the minimum length", () => {
    const result = validateFeedbackSubmission({ ...validBase, message: "short" });
    expect(result.ok).toBe(false);
  });

  it("rejects a message at exactly one character under the minimum", () => {
    const message = "a".repeat(FEEDBACK_MESSAGE_MIN_LENGTH - 1);
    expect(validateFeedbackSubmission({ ...validBase, message }).ok).toBe(false);
  });

  it("accepts a message at exactly the minimum length", () => {
    const message = "a".repeat(FEEDBACK_MESSAGE_MIN_LENGTH);
    expect(validateFeedbackSubmission({ ...validBase, message })).toEqual({ ok: true });
  });

  it("rejects a message longer than the maximum length", () => {
    const message = "a".repeat(FEEDBACK_MESSAGE_MAX_LENGTH + 1);
    expect(validateFeedbackSubmission({ ...validBase, message }).ok).toBe(false);
  });

  it("accepts a message at exactly the maximum length", () => {
    const message = "a".repeat(FEEDBACK_MESSAGE_MAX_LENGTH);
    expect(validateFeedbackSubmission({ ...validBase, message })).toEqual({ ok: true });
  });

  it("trims whitespace before checking length", () => {
    const message = `   ${"a".repeat(FEEDBACK_MESSAGE_MIN_LENGTH - 2)}   `;
    expect(validateFeedbackSubmission({ ...validBase, message }).ok).toBe(false);
  });

  it("rejects an invalid source", () => {
    expect(validateFeedbackSubmission({ ...validBase, source: "carrier-pigeon" }).ok).toBe(false);
  });

  it("accepts both valid sources", () => {
    expect(validateFeedbackSubmission({ ...validBase, source: "dashboard" })).toEqual({ ok: true });
    expect(validateFeedbackSubmission({ ...validBase, source: "website" })).toEqual({ ok: true });
  });
});

describe("validateFeedbackSubmission — invalid email handling", () => {
  it("accepts a missing/empty email (optional for public visitors)", () => {
    expect(validateFeedbackSubmission({ ...validBase, email: undefined })).toEqual({ ok: true });
    expect(validateFeedbackSubmission({ ...validBase, email: "" })).toEqual({ ok: true });
    expect(validateFeedbackSubmission({ ...validBase, email: "   " })).toEqual({ ok: true });
  });

  it("accepts a well-formed email", () => {
    expect(validateFeedbackSubmission({ ...validBase, email: "person@example.com" })).toEqual({ ok: true });
  });

  it("rejects an email with no @", () => {
    expect(validateFeedbackSubmission({ ...validBase, email: "not-an-email" }).ok).toBe(false);
  });

  it("rejects an email with no domain", () => {
    expect(validateFeedbackSubmission({ ...validBase, email: "person@" }).ok).toBe(false);
  });

  it("rejects an email with no TLD", () => {
    expect(validateFeedbackSubmission({ ...validBase, email: "person@example" }).ok).toBe(false);
  });
});

describe("isSuspiciouslyFast — bot/abuse timing heuristic", () => {
  it("flags a submission arriving before the minimum fill time", () => {
    const now = 1_000_000;
    expect(isSuspiciouslyFast(now - (MIN_FILL_TIME_MS - 1), now)).toBe(true);
  });

  it("does not flag a submission arriving after the minimum fill time", () => {
    const now = 1_000_000;
    expect(isSuspiciouslyFast(now - (MIN_FILL_TIME_MS + 1), now)).toBe(false);
  });

  it("does not flag when renderedAt is absent", () => {
    expect(isSuspiciouslyFast(undefined)).toBe(false);
  });
});
