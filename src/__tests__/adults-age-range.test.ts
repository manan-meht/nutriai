import fs from "fs";
import path from "path";

// The age field on the family forms.
//
// Adding a family member required an age of 40 or more — a leftover from
// when this product was only for tracking an older parent. A real user was
// blocked adding HERSELF, on a form that sat next to a self-setup card
// already accepting 1 to 120.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");

const FORMS = [
  "components/adults/AddContactModal.tsx",
  "components/adults/dashboard/EditContactModal.tsx",
  "components/adults/SelfSetupCard.tsx",
];

/** The age input on a form, or null if it has none. */
function ageInput(file: string): string | null {
  const t = src(file);
  const idx = t.indexOf('label="Age"');
  if (idx < 0) return null;
  return t.slice(idx, idx + 400);
}

describe("age accepts a whole family", () => {
  it("does not require anyone to be over 40", () => {
    for (const f of FORMS) {
      const input = ageInput(f);
      if (!input) continue;
      expect(input).not.toMatch(/min="40"/);
      expect(input).not.toMatch(/min="1[0-9]"|min="[2-9][0-9]"/);
    }
  });

  it("uses the same range on every form", () => {
    // The add form refusing an age the edit form accepts is how this went
    // unnoticed: editing worked, only adding failed.
    for (const f of FORMS) {
      const input = ageInput(f);
      if (!input) continue;
      expect(input).toMatch(/min="1"/);
      expect(input).toMatch(/max="120"/);
    }
  });

  it("bounds the edit form at all", () => {
    // It was previously unbounded, so an age the add form refused could
    // still be saved there.
    const input = ageInput("components/adults/dashboard/EditContactModal.tsx");
    expect(input).toMatch(/min="1"/);
  });

  it("does not suggest an elderly age in the placeholder", () => {
    // "65" told a parent adding a child that they were on the wrong form.
    const input = ageInput("components/adults/AddContactModal.tsx");
    expect(input).not.toMatch(/placeholder="65"/);
  });
});
