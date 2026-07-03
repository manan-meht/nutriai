import fs from "fs";
import path from "path";

const src = (relPath: string) => fs.readFileSync(path.join(__dirname, "..", relPath), "utf-8");

// Customer-facing surfaces that must carry the Tistra Health brand and must
// not regress to the legacy "Tistra Family" / "Tistra Coach" / "NutriAI"
// product names. Internal-only identifiers (e.g. the +nutriai-adults email
// scoping tag in lib/auth.ts, or console.error log tags) are intentionally
// out of scope here — see lib/auth.ts and conversation-handler.ts comments.
const CUSTOMER_FACING_FILES = [
  "app/layout.tsx",
  "app/(public)/page.tsx",
  "app/(public)/login/page.tsx",
  "app/(public)/signup/page.tsx",
  "app/(gym)/gym/login/page.tsx",
  "app/(adults)/adults/login/page.tsx",
  "app/(adults)/adults/dashboard/actions.ts",
  "components/landing/shared/LandingNav.tsx",
  "components/landing/shared/LandingFooter.tsx",
  "components/auth/AuthForm.tsx",
  "components/gym/GymDashboardClient.tsx",
  "components/adults/AdultsDashboardClient.tsx",
  "components/adults/AddContactModal.tsx",
  "components/gym/AddClientModal.tsx",
  "lib/whatsapp/conversation-handler.ts",
  "lib/ai/food-analyzer.ts",
];

describe("branding: legacy product names removed from customer-facing surfaces", () => {
  it.each(CUSTOMER_FACING_FILES)("%s contains no legacy brand strings", (relPath) => {
    const contents = src(relPath);
    expect(contents).not.toMatch(/Tistra Family/);
    expect(contents).not.toMatch(/Tistra Coach\b/);
    // Allow the internal "[NutriAI]" log tag but not a customer-facing
    // self-identification as NutriAI (e.g. "I'm NutriAI" / "You are NutriAI").
    expect(contents).not.toMatch(/(I'm|You are) NutriAI/);
  });

  // "Tistra Health" is the only customer-facing brand name — Family and
  // Coaching are modules under it, not compound brand names like
  // "Tistra Health Family" / "Tistra Health Coaching".
  it.each(CUSTOMER_FACING_FILES)("%s contains no compound module brand names", (relPath) => {
    const contents = src(relPath);
    expect(contents).not.toMatch(/Tistra Health Family/);
    expect(contents).not.toMatch(/Tistra Health Coaching/);
  });

  it("root layout uses Tistra Health branding", () => {
    expect(src("app/layout.tsx")).toMatch(/title:\s*"Tistra Health"/);
  });

  it("WhatsApp bot identifies itself as Tistra Health, not NutriAI", () => {
    expect(src("lib/whatsapp/conversation-handler.ts")).toMatch(/I'm Tistra Health/);
  });

  it("AI system prompt identifies itself as Tistra Health, not NutriAI", () => {
    expect(src("lib/ai/food-analyzer.ts")).toMatch(/You are Tistra Health/);
  });

  it("gym dashboard and nav are labelled Tistra Health", () => {
    expect(src("components/gym/GymDashboardClient.tsx")).toMatch(/Tistra Health/);
    expect(src("components/landing/shared/LandingNav.tsx")).toMatch(/Tistra Health/);
  });

  it("adults/family dashboard and nav are labelled Tistra Health", () => {
    expect(src("components/adults/AdultsDashboardClient.tsx")).toMatch(/Tistra Health/);
    expect(src("components/landing/shared/LandingNav.tsx")).toMatch(/Tistra Health/);
  });
});
