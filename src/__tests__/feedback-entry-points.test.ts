import { readFileSync } from "fs";
import { join } from "path";

// This repo has no React component-rendering test setup (no
// @testing-library/react, jest's testEnvironment is "node" — see
// jest.config.ts) — rather than introduce new test tooling for one
// feature, these are lightweight source-presence checks that the
// Feedback entry points weren't accidentally removed from each surface,
// which is the failure mode that actually matters here (a link silently
// disappearing from a footer/header edit).
function read(relativePath: string): string {
  return readFileSync(join(__dirname, "..", "..", relativePath), "utf8");
}

describe("Feedback entry point visibility", () => {
  it("adults dashboard header has a Send Feedback trigger", () => {
    const src = read("src/components/adults/AdultsDashboardClient.tsx");
    expect(src).toMatch(/Send Feedback/);
    expect(src).toMatch(/FeedbackModal/);
  });

  it("gym dashboard header has a Send Feedback trigger", () => {
    const src = read("src/components/gym/GymDashboardClient.tsx");
    expect(src).toMatch(/Send Feedback/);
    expect(src).toMatch(/FeedbackModal/);
  });

  it("marketing footer (home, family, coach, me) links to /feedback", () => {
    const src = read("src/components/home/MarketingFooter.tsx");
    expect(src).toMatch(/href="\/feedback"/);
  });

  it("landing footer (gym/adults product pages) links to /feedback", () => {
    const src = read("src/components/landing/shared/LandingFooter.tsx");
    expect(src).toMatch(/href="\/feedback"/);
  });

  it("the public /feedback page renders the shared FeedbackForm with source=website", () => {
    const src = read("src/app/(public)/feedback/page.tsx");
    expect(src).toMatch(/FeedbackForm/);
    expect(src).toMatch(/source="website"/);
  });

  it("dashboard modal passes source=dashboard and the correct product per surface", () => {
    const adults = read("src/components/feedback/FeedbackModal.tsx");
    expect(adults).toMatch(/source="dashboard"/);

    const adultsUsage = read("src/components/adults/AdultsDashboardClient.tsx");
    expect(adultsUsage).toMatch(/product="adults"/);

    const gymUsage = read("src/components/gym/GymDashboardClient.tsx");
    expect(gymUsage).toMatch(/product="gym"/);
  });
});
