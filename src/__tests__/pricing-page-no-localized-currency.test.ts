import fs from "fs";
import path from "path";

// Static-analysis guard: the public /pricing page and its PricingSection
// component must never pull in the multi-market (SGD/AUD/INR) billing
// pricing table or IP-based market resolution — those are exclusively for
// the authenticated dashboards' live checkout pricing. This repo's jest
// config only runs .ts specs (no React Testing Library / DOM rendering
// configured), so this is a source-level check rather than a rendered-DOM
// assertion.
describe("public pricing page never references localized/multi-market pricing", () => {
  const files = [
    "src/app/(public)/pricing/page.tsx",
    "src/components/pricing/PricingSection.tsx",
    "src/components/pricing/BetaPricingNotice.tsx",
  ].map((p) => path.join(process.cwd(), p));

  it.each(files)("%s does not import billing/pricing or billing/market", (file) => {
    const contents = fs.readFileSync(file, "utf8");
    expect(contents).not.toMatch(/from ["']@\/lib\/billing\/pricing["']/);
    expect(contents).not.toMatch(/from ["']@\/lib\/billing\/market["']/);
    expect(contents).not.toMatch(/\bSGD\b/);
    expect(contents).not.toMatch(/\bAUD\b/);
    expect(contents).not.toMatch(/\bINR\b/);
  });
});
