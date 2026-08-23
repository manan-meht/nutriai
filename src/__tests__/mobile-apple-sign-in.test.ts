import fs from "fs";
import path from "path";

// Sign in with Apple, required by App Store guideline 4.8 because the app
// offers Google and Facebook sign-in. Without it the binary is rejected,
// so these assertions are about shipping at all rather than polish.

const mobile = (p: string) => fs.readFileSync(path.join(__dirname, "..", "..", "apps/mobile", p), "utf-8");
const code = (p: string) => mobile(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

describe("the app is configured to present Apple's sheet", () => {
  const appJson = () => JSON.parse(mobile("app.json")).expo;

  it("declares the entitlement", () => {
    // Without usesAppleSignIn the capability is absent from the
    // provisioning profile and the sheet fails at runtime.
    expect(appJson().ios.usesAppleSignIn).toBe(true);
  });

  it("includes the config plugin", () => {
    const plugins = appJson().plugins.map((p: any) => (Array.isArray(p) ? p[0] : p));
    expect(plugins).toContain("expo-apple-authentication");
  });

  it("has the package installed", () => {
    const pkg = JSON.parse(mobile("package.json"));
    expect(pkg.dependencies["expo-apple-authentication"]).toBeTruthy();
  });
});

describe("the button is Apple's own", () => {
  it("renders AppleAuthenticationButton, not a look-alike", () => {
    // A hand-built button using Apple's mark is a rejection; the HIG
    // requires their component's wording and styling.
    const t = code("src/components/apple-sign-in-button.tsx");
    expect(t).toMatch(/AppleAuthentication\.AppleAuthenticationButton/);
  });

  it("uses the sign-up wording on the sign-up screen", () => {
    expect(code("src/app/signup.tsx")).toMatch(/mode="signUp"/);
    expect(code("src/app/login.tsx")).toMatch(/mode="signIn"/);
  });

  it("appears at least as prominently as Google and Facebook", () => {
    // Guideline 4.8 asks for equivalent prominence; placing it first is
    // the unambiguous reading.
    for (const screen of ["src/app/login.tsx", "src/app/signup.tsx"]) {
      const t = code(screen);
      const apple = t.indexOf("<AppleSignInButton");
      const google = t.indexOf("handleOAuth('google')");
      expect(apple).toBeGreaterThan(-1);
      expect(apple).toBeLessThan(google);
    }
  });

  it("renders nothing where it cannot be presented", () => {
    // Android, and iOS versions without the API.
    const t = code("src/components/apple-sign-in-button.tsx");
    expect(t).toMatch(/if \(!available\) return null;/);
    expect(code("src/lib/apple-auth.ts")).toMatch(/Platform\.OS === 'ios'/);
  });
});

describe("the once-only name", () => {
  it("captures the name on first authorization", () => {
    // Apple returns fullName exactly once, on the first authorization for
    // this bundle id. Miss it and the account has no name for good.
    const t = code("src/lib/apple-auth.ts");
    expect(t).toMatch(/credential\.fullName\?\.givenName/);
    expect(t).toMatch(/updateUser\(\{ data: \{ full_name: fullName \} \}\)/);
  });

  it("does not fail the sign-in if saving the name fails", () => {
    const t = code("src/lib/apple-auth.ts");
    const after = t.slice(t.indexOf("if (fullName)"));
    expect(after).toMatch(/try \{[\s\S]*?catch/);
  });

  it("requests both name and email scopes", () => {
    const t = code("src/lib/apple-auth.ts");
    expect(t).toMatch(/AppleAuthenticationScope\.FULL_NAME/);
    expect(t).toMatch(/AppleAuthenticationScope\.EMAIL/);
  });
});

describe("exchanging the token", () => {
  it("uses the native identity token, not a browser round-trip", () => {
    // The native flow is what Apple expects on iOS, and it needs no Apple
    // Services ID — the bundle id is the audience.
    const t = code("src/lib/apple-auth.ts");
    expect(t).toMatch(/signInWithIdToken\(\{\s*provider: 'apple'/);
    expect(t).not.toMatch(/openAuthSessionAsync/);
  });

  it("refuses to continue without a token", () => {
    expect(code("src/lib/apple-auth.ts")).toMatch(/if \(!credential\.identityToken\)/);
  });

  it("treats a dismissed sheet as a cancellation, not an error", () => {
    expect(code("src/lib/apple-auth.ts")).toMatch(/ERR_REQUEST_CANCELED/);
    for (const screen of ["src/app/login.tsx", "src/app/signup.tsx"]) {
      expect(code(screen)).toMatch(/if \(err instanceof AppleSignInCancelled\) return;/);
    }
  });
});
