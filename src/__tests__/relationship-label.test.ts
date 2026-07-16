import { relationshipLabelForNotification } from "@/lib/whatsapp/conversation-handler";

describe("relationshipLabelForNotification", () => {
  it("passes through already-unambiguous terms unchanged", () => {
    expect(relationshipLabelForNotification("son", null)).toBe("son");
    expect(relationshipLabelForNotification("daughter", "female")).toBe("daughter");
    expect(relationshipLabelForNotification("friend", "male")).toBe("friend");
  });

  it("computes the gendered term for parent/sibling/spouse from gender", () => {
    expect(relationshipLabelForNotification("parent", "male")).toBe("father");
    expect(relationshipLabelForNotification("parent", "female")).toBe("mother");
    expect(relationshipLabelForNotification("sibling", "male")).toBe("brother");
    expect(relationshipLabelForNotification("sibling", "female")).toBe("sister");
    expect(relationshipLabelForNotification("spouse", "male")).toBe("husband");
    expect(relationshipLabelForNotification("spouse", "female")).toBe("wife");
  });

  it("falls back to the gender-neutral term when gender is missing or 'other'", () => {
    expect(relationshipLabelForNotification("parent", null)).toBe("parent");
    expect(relationshipLabelForNotification("parent", "other")).toBe("parent");
    expect(relationshipLabelForNotification("sibling", undefined)).toBe("sibling");
    expect(relationshipLabelForNotification("spouse", "other")).toBe("spouse");
  });

  it("returns null for 'other', missing, or unrecognized relationships (caller falls back to first name)", () => {
    expect(relationshipLabelForNotification("other", "male")).toBeNull();
    expect(relationshipLabelForNotification(null, "male")).toBeNull();
    expect(relationshipLabelForNotification(undefined, "female")).toBeNull();
    expect(relationshipLabelForNotification("nephew", "male")).toBeNull();
  });
});
