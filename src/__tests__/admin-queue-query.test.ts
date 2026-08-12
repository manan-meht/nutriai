// The review queue's filters live in the URL, but every link out of the
// queue used to drop the querystring — so opening a meal and coming back
// reset it to "pending / newest / page 1". These cover the helper that
// carries the state through.

import { queueQueryString } from "@/lib/admin/queue-query";

describe("queueQueryString", () => {
  const filters = {
    status: "reviewed",
    priority: "high",
    mealType: "lunch",
    source: "whatsapp",
    sort: "lowest_confidence",
    page: "3",
  };

  it("round-trips every filter so a detail link can come back to the same view", () => {
    const parsed = new URLSearchParams(queueQueryString(filters));
    expect(parsed.get("status")).toBe("reviewed");
    expect(parsed.get("priority")).toBe("high");
    expect(parsed.get("mealType")).toBe("lunch");
    expect(parsed.get("source")).toBe("whatsapp");
    expect(parsed.get("sort")).toBe("lowest_confidence");
    expect(parsed.get("page")).toBe("3");
  });

  it("drops id, so a back link returns to the queue rather than the meal just left", () => {
    const qs = queueQueryString({ ...filters, id: "meal-123" });
    expect(qs).not.toContain("meal-123");
    expect(qs).not.toContain("id=");
  });

  it("drops tab, since the queue is the default tab", () => {
    expect(queueQueryString({ status: "pending", tab: "meal-review" })).toBe("status=pending");
  });

  it("omits empty values instead of emitting blank params", () => {
    expect(queueQueryString({ status: "pending", mealType: "", market: undefined })).toBe("status=pending");
  });

  it("overrides a single key while preserving the rest", () => {
    const parsed = new URLSearchParams(queueQueryString(filters, { page: "4" }));
    expect(parsed.get("page")).toBe("4");
    expect(parsed.get("status")).toBe("reviewed");
    expect(parsed.get("sort")).toBe("lowest_confidence");
  });

  it("removes a key when the override is undefined — page 1 needs no param", () => {
    const parsed = new URLSearchParams(queueQueryString(filters, { page: undefined }));
    expect(parsed.has("page")).toBe(false);
    expect(parsed.get("status")).toBe("reviewed");
  });

  it("returns an empty string for an unfiltered queue", () => {
    expect(queueQueryString({})).toBe("");
  });
});
