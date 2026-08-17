import fs from "fs";
import path from "path";

const src = (relPath: string) => fs.readFileSync(path.join(__dirname, "..", relPath), "utf-8");

// Customer-facing Tistra HEALTH surfaces. These must carry the Tistra
// Health brand and must not regress to the legacy "Tistra Family" /
// "NutriAI" product names. Internal-only identifiers (e.g. the
// +nutriai-adults email scoping tag in lib/auth.ts, or console.error log
// tags) are intentionally out of scope — see lib/auth.ts and
// conversation-handler.ts comments.
//
// POLICY CHANGE (Aug 2026): "Tistra Coach" is no longer a legacy name to be
// removed. Coaching was split out into its own product on its own domain
// (coach.tistrahealth.com), so the brand is deliberate wherever the coach
// product is served — see COACH_PRODUCT_FILES below. It remains banned on
// Health surfaces, which must not advertise a different product.
// "Tistra Family" stays banned everywhere: that consolidation still holds.
const CUSTOMER_FACING_FILES = [
  "app/layout.tsx",
  "app/(public)/login/page.tsx",
  "app/(public)/signup/page.tsx",
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

/** Files that legitimately serve the Tistra Coach product and may therefore
 * use its brand. page.tsx is here because one route serves every host: it
 * renders Tistra Health's landing for the family/neutral hosts and Tistra
 * Coach's for coach.tistrahealth.com. */
const COACH_PRODUCT_FILES = [
  "app/(public)/page.tsx",
  "app/(public)/coach/page.tsx",
  "components/landing/coach/CoachLanding.tsx",
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

  // The other half of the Aug 2026 split: the coach product must actually
  // BE branded Tistra Coach, not silently revert to Tistra Health's
  // nutrition-tracking pitch (which is what its old landing page sold, and
  // why nobody used it).
  it.each(COACH_PRODUCT_FILES)("%s carries Tistra Coach branding", (relPath) => {
    expect(src(relPath)).toMatch(/Tistra Coach/);
  });

  it("the coach landing does not lead with nutrition tracking", () => {
    const contents = src("components/landing/coach/CoachLanding.tsx");
    // Nutrition is one capability among several; if it ever climbs back to
    // the top of the page, this product has drifted again.
    const nutritionAt = contents.indexOf("Nutrition");
    const marketplaceAt = contents.indexOf("Marketplace");
    expect(marketplaceAt).toBeGreaterThan(-1);
    expect(nutritionAt).toBeGreaterThan(marketplaceAt);
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
