import fs from "fs";
import path from "path";

// Tistra Health's own surfaces must not advertise coaching.
//
// Coaching is a separate product on a separate domain with its own signup.
// Every coach-facing link left on the Health homepage sent a visitor toward
// a product they can't sign up for here, and (before the split) into a
// signup path that no longer exists. This pins the removal so a future edit
// has to be deliberate.
//
// Scope is Health's own marketing chrome only. The coach host's landing
// (CoachLanding) and the routing in app/(public)/page.tsx that serves it
// obviously still name the product — that's the whole point of that file.

const SRC = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf-8");

/** Health surfaces: rendered on tistrahealth.com for a consumer. */
const HEALTH_SURFACES = [
  "components/home/MasterHome.tsx",
  "components/home/UnifiedHome.tsx",
  "components/home/GetStartedModal.tsx",
];

/** Strips comments — the files explain *why* coaching was removed, and
 * that explanation must not itself trip the check. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("Tistra Health surfaces do not advertise coaching", () => {
  it.each(HEALTH_SURFACES)("%s has no coach-facing copy", (file) => {
    const body = code(read(file));
    expect(body).not.toMatch(/\bCoach\b/);
    expect(body).not.toMatch(/coaching/i);
    expect(body).not.toMatch(/getCoachAppUrl/);
  });

  it.each(HEALTH_SURFACES)("%s links nowhere coach-related", (file) => {
    const body = code(read(file));
    expect(body).not.toMatch(/["'`]\/coach/);
    expect(body).not.toMatch(/coach\.tistrahealth\.com/);
  });

  it("the shared marketing nav has no Coach link", () => {
    const nav = code(read("components/home/MarketingHeader.tsx"));
    expect(nav).not.toMatch(/href="\/coach"/);
  });

  it("the footer does not cross-sell coaching from Health pages", () => {
    const footer = code(read("components/home/MarketingFooter.tsx"));
    expect(footer).not.toMatch(/Switch to the coaching view/);
    // The coach variant's own tagline is allowed — that footer renders on
    // the coach host, where naming the product is correct.
    const taglines = footer.slice(footer.indexOf("const TAGLINE"), footer.indexOf("}", footer.indexOf("const TAGLINE")));
    expect(taglines).not.toMatch(/home: "[^"]*coach/i);
  });

  it("the neutral-host metadata does not describe coaching", () => {
    const page = read("app/(public)/page.tsx");
    // Just the two neutral-host metadata blocks. The CoachLanding import
    // above them and the gym block below them both belong to the coach
    // host and must stay.
    const neutral = page.slice(
      page.indexOf("if (!byHostname"),
      page.indexOf('if (product === "gym")')
    );
    expect(code(neutral)).not.toMatch(/coach/i);
  });

  it("still serves the coach product on its own host", () => {
    // The counter-check: removing the mentions must not have removed the
    // routing that makes coach.tistrahealth.com work.
    const page = read("app/(public)/page.tsx");
    expect(page).toMatch(/CoachLanding/);
  });
});

// The mobile app is a Tistra Health surface too, and its sign-in screen had
// its own coach path — a /login?product=coach deep link presented "Sign in
// to your coaching account" and scoped the email to the gym product, long
// after the product picker stopped offering it. Read from disk rather than
// imported: jest's @/ alias points at the web app's src, and these are
// React Native screens.
const MOBILE = path.join(__dirname, "..", "..", "apps", "mobile", "src");
const readMobile = (p: string) => fs.readFileSync(path.join(MOBILE, p), "utf-8");

describe("mobile app auth screens offer no coach path", () => {
  it.each(["app/login.tsx", "app/signup.tsx"])("%s has no coach product", (file) => {
    const body = code(readMobile(file));
    expect(body).not.toMatch(/coach/i);
    // The gym scope was how a coach sign-in reached a different account.
    expect(body).not.toMatch(/'gym'/);
  });

  it.each(["app/login.tsx", "app/signup.tsx"])("%s still offers both adult products", (file) => {
    const body = code(readMobile(file));
    expect(body).toMatch(/self: \{ scopeAs: 'adults'/);
    expect(body).toMatch(/family: \{ scopeAs: 'adults'/);
  });

  it("the product picker offers only the two adult products", () => {
    const picker = code(readMobile("components/product-picker.tsx"));
    const options = picker.slice(picker.indexOf("const OPTIONS"), picker.indexOf("];", picker.indexOf("const OPTIONS")));
    expect((options.match(/key: '/g) ?? []).length).toBe(2);
    expect(options).not.toMatch(/coach/i);
  });

  it("an unknown product param falls through to the picker", () => {
    // This is what makes a stale ?product=coach deep link safe rather than
    // a crash or a silent wrong-account sign-in.
    expect(readMobile("app/login.tsx")).toMatch(/!\(product in PRODUCT_CONFIG\)/);
    expect(readMobile("app/login.tsx")).toMatch(/Redirect href="\/select-product"/);
  });
});

// The mobile app had no coaching product at all from Aug 2026 (#29) until
// Oct 2026, when a coach view came back for one narrow case: an account
// that ALREADY owns a gym workspace — a Coach-plan coach whose clients log
// meals on WhatsApp — managing those clients from the phone. What #29
// guarded is still guarded below, in the narrower form that is now true:
// Tistra Health never OFFERS coaching (the sign-in and sign-up checks above
// are untouched), and nothing in the app creates a gym workspace or routes
// an account to the coach view without one.
describe("mobile app shows a coach view only to existing coach accounts", () => {
  it("registers the gym screens and route", () => {
    for (const f of ["index.tsx", "[clientId].tsx", "add.tsx", "invite.tsx", "edit/[clientId].tsx", "_layout.tsx"]) {
      expect([f, fs.existsSync(path.join(MOBILE, "app", "(app)", "gym", f))]).toEqual([f, true]);
    }
    expect(code(readMobile("app/(app)/_layout.tsx"))).toMatch(/name="gym"/);
  });

  it("decides the dashboard from workspace ownership, not from a product pick", () => {
    const router = code(readMobile("app/(app)/index.tsx"));
    expect(router).toMatch(/chooseDashboard\(/);
    expect(router).toMatch(/ownsGym: Boolean\(gym\)/);
    // The ownership check must be the side-effect-free one: /gym/workspace
    // get-or-creates, so calling it here would hand every Health account
    // an empty gym workspace.
    expect(router).toMatch(/api\.getMyProducts\(\)/);
    expect(router).not.toMatch(/getGymWorkspace|getGymClients/);
  });

  it("calls the get-or-create gym endpoints only from gym screens, or behind products.gym", () => {
    const callers = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return callers(p);
        return /\.tsx?$/.test(e.name) && /api\.(getGymWorkspace|getGymClients|getRemovedGymClients)\(/.test(fs.readFileSync(p, "utf-8"))
          ? [path.relative(MOBILE, p)]
          : [];
      });
    for (const file of callers(MOBILE)) {
      const insideGym = file.startsWith(path.join("app", "(app)", "gym") + path.sep);
      const gatedOnOwnership = file === path.join("lib", "dynamic-app-icon.ts") && /if \(products\.gym\)/.test(readMobile(file));
      expect([file, insideGym || gatedOnOwnership]).toEqual([file, true]);
    }
  });

  it("keeps the product types and picker at the two adult products", () => {
    expect(code(readMobile("components/product-picker.tsx"))).toMatch(/ProductKey = 'self' \| 'family';/);
    expect(code(readMobile("lib/product-intent.ts"))).toMatch(/PendingProduct = 'self' \| 'family';/);
  });

  it("sells no Coach plan in the app", () => {
    // Coach billing is on the web (Stripe/Razorpay); the stores carry no
    // Coach products, so the coach view must not reach RevenueCat.
    expect(fs.existsSync(path.join(MOBILE, "app", "(app)", "gym", "paywall.tsx"))).toBe(false);
    const list = code(readMobile("app/(app)/gym/index.tsx"));
    expect(list).not.toMatch(/react-native-purchases|Purchases\./);
  });

  it("offers the switch between dashboards on both sides", () => {
    expect(code(readMobile("app/(app)/adults/index.tsx"))).toMatch(/useDashboardSwitch\('adults'\)/);
    expect(code(readMobile("app/(app)/gym/index.tsx"))).toMatch(/useDashboardSwitch\('gym'\)/);
    // And the switch itself only appears when the account owns both.
    expect(code(readMobile("hooks/use-dashboard-switch.ts"))).toMatch(/products\.adults && products\.gym/);
  });
});

// The app showed the EXPO logo for ~600ms on every cold start: a JS splash
// overlay from the starter template hid the native Tistra splash as soon as
// it laid out, displayed assets/images/expo-logo.png, then animated away.
// Removing it means the native splash must be hidden explicitly instead —
// a missed hideAsync() call leaves the user stuck on the splash forever.
describe("mobile cold start shows no Expo branding", () => {
  it("ships no Expo logo or badge assets", () => {
    for (const asset of ["expo-logo.png", "expo-badge.png", "expo-badge-white.png"]) {
      const p = path.join(MOBILE, "..", "assets", "images", asset);
      expect([asset, fs.existsSync(p)]).toEqual([asset, false]);
    }
  });

  it("has no splash overlay component", () => {
    for (const f of ["components/animated-icon.tsx", "components/animated-icon.web.tsx"]) {
      expect([f, fs.existsSync(path.join(MOBILE, f))]).toEqual([f, false]);
    }
  });

  it("the root layout no longer mounts an overlay", () => {
    expect(code(readMobile("app/_layout.tsx"))).not.toMatch(/AnimatedSplashOverlay/);
  });

  it("still hides the native splash once auth resolves", () => {
    // The overlay used to be the only caller of hideAsync(). Without a
    // replacement, preventAutoHideAsync() would strand every user on the
    // splash screen.
    const layout = code(readMobile("app/_layout.tsx"));
    expect(layout).toMatch(/SplashScreen\.preventAutoHideAsync\(\)/);
    expect(layout).toMatch(/if \(!loading\) SplashScreen\.hideAsync\(\)/);
  });
});
