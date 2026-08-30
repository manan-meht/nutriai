import fs from "fs";
import path from "path";

/** "Help me set it up" has to reach a human.
 *
 * Before this it only set needs_onboarding_help in user metadata and drew
 * a badge on /admin/coaches — which nobody sees unless they go looking. A
 * coach who asks for help and hears nothing for a week has been told
 * something untrue by the landing page.
 *
 * The request is raised on signup COMPLETION, not on the link click: a
 * click carries no address to reply to. Intent-without-signup is already
 * measured by the onboarding_help_click event.
 */
const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const EMAIL = "lib/coach/onboarding-help-email.ts";
const ACTION = "app/actions/coach-onboarding-help.ts";
const FORM = "components/auth/AuthForm.tsx";

describe("the request reaches manan@tistra.sg", () => {
  const mail = code(EMAIL);

  it("defaults to that address", () => {
    expect(mail).toMatch(/COACH_ONBOARDING_HELP_EMAIL \|\| "manan@tistra\.sg"/);
  });

  it("replies to the coach, not to us", () => {
    expect(mail).toMatch(/reply_to: payload\.email/);
  });

  it("says which market it came from", () => {
    expect(mail).toMatch(/payload\.market === "in" \? "India" : "Singapore"/);
  });

  it("never throws — a failed email must not look like a failed signup", () => {
    expect(mail).toMatch(/try \{/);
    expect(mail).toMatch(/catch \(err\)/);
    expect(code(ACTION)).toMatch(/Promise<void>/);
  });
});

describe("both landing pages raise it", () => {
  it("the one landing links to signup with help=1", () => {
    // Singapore and India are the same component now; the source comes
    // from the market config so each still reports its own.
    expect(code("components/landing/coach/CoachLanding.tsx")).toMatch(/\$\{signupHref\}&help=1/);
    expect(code("components/landing/coach/CoachLanding.tsx")).toMatch(/source: market\.signupSource/);
  });

  it.each([
    ["sg", "coach_landing"],
    ["in", "coach_landing_in"],
  ])("the %s market reports source %s", (id, source) => {
    const cfg = code("lib/landing/coach-market.ts");
    expect(cfg).toMatch(new RegExp(`signupSource: "${source}"`));
    expect(cfg).toMatch(new RegExp(`id: "${id}"`));
  });

  it("signup maps the India source to the India market", () => {
    expect(code("app/(public)/signup/page.tsx")).toMatch(
      /params\.source === "coach_landing_in" \? "in" : "sg"/
    );
  });
});

describe("when it fires", () => {
  const form = code(FORM);

  it("is raised after signup succeeds, not on the click", () => {
    const completed = form.indexOf('track("signup_completed"');
    const raised = form.indexOf("requestCoachOnboardingHelp(");
    expect(completed).toBeGreaterThan(-1);
    expect(raised).toBeGreaterThan(completed);
  });

  it("only when help was actually asked for", () => {
    const raised = form.indexOf("requestCoachOnboardingHelp(");
    expect(form.slice(Math.max(0, raised - 120), raised)).toMatch(/if \(onboardingHelp\)/);
  });

  it("does not block the signup on the email", () => {
    // Awaiting it would make a slow Resend call look like a hung signup.
    expect(form).toMatch(/void requestCoachOnboardingHelp\(/);
  });

  it("still records it in metadata, so a lost email is recoverable", () => {
    expect(form).toMatch(/needs_onboarding_help: true/);
    expect(code("app/(admin)/admin/coaches/page.tsx")).toMatch(/wants setup help/);
  });
});

describe("the action is safe to expose", () => {
  const action = code(ACTION);

  it("is a server action", () => {
    expect(read(ACTION).startsWith('"use server"')).toBe(true);
  });

  it("takes no free text — only an address, a market and a source", () => {
    // Signup ends before a session exists, so this endpoint is necessarily
    // unauthenticated. Keeping it boring is the mitigation.
    expect(action).not.toMatch(/message|body|note|comment/i);
    expect(action).toMatch(/market === "in" \? "in" : "sg"/);
    expect(action).toMatch(/source\.slice\(0, 64\)/);
  });

  it("validates the address shape and bounds its length", () => {
    expect(action).toMatch(/email\.length > 254/);
    expect(action).toMatch(/\^\[\^@\\s\]\+@/);
  });

  it("sends to a fixed internal recipient, never a caller-supplied one", () => {
    expect(action).not.toMatch(/to:|recipient/);
  });
});
