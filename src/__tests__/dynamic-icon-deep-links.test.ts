import path from "path";

/** Changing the launcher icon must not break deep links.
 *
 * expo-dynamic-app-icon switches icons by enabling an <activity-alias> and
 * DISABLING .MainActivity, and the aliases it generates carry MAIN/LAUNCHER
 * and nothing else. Every deep-link intent-filter lives on .MainActivity,
 * so once a user's icon changed, tistramobile:// URIs stopped resolving:
 *
 *   disabled: .MainActivity            <- owns the tistramobile:// filter
 *   enabled:  .MainActivitybowl_half
 *   $ adb shell am start -d "tistramobile://auth/callback"
 *   Error: unable to resolve Intent
 *
 * That silently broke Google/Facebook OAuth, the signup confirmation link
 * and password reset for anyone who had used the app long enough for the
 * icon to change — with no error shown, because expo-web-browser just waits
 * for a redirect that can never arrive. Found on a Pixel 8 Pro on build 40.
 */

 
const plugin = require(path.join(__dirname, "..", "..", "apps", "mobile", "plugins", "withAdaptiveDynamicIcons.js"));
 
const appJson = require(path.join(__dirname, "..", "..", "apps", "mobile", "app.json"));

type Node = Record<string, any>;

const ICONS: Record<string, { image: string }> = (appJson.expo.plugins as unknown[])
  .filter((p): p is [string, Record<string, { image: string }>] => Array.isArray(p))
  .find((p) => /dynamic-app-icon/.test(p[0]))![1];

const named = (name: string) => ({ $: { "android:name": name } });

/** A manifest shaped the way expo-dynamic-app-icon leaves it: MainActivity
 * owns the deep links, the aliases carry only MAIN/LAUNCHER. */
function manifestFixture(deepLinks = true): Node {
  const mainFilters: Node[] = [
    { action: [named("android.intent.action.MAIN")], category: [named("android.intent.category.LAUNCHER")] },
  ];
  if (deepLinks) {
    mainFilters.push({
      action: [named("android.intent.action.VIEW")],
      category: [named("android.intent.category.DEFAULT"), named("android.intent.category.BROWSABLE")],
      data: [{ $: { "android:scheme": "tistramobile" } }, { $: { "android:scheme": "exp+tistra-mobile" } }],
    });
  }
  return {
    manifest: {
      application: [
        {
          $: { "android:name": ".MainApplication" },
          activity: [{ $: { "android:name": ".MainActivity" }, "intent-filter": mainFilters }],
          "activity-alias": Object.keys(ICONS).map((n) => ({
            $: { "android:name": `.MainActivity${n}`, "android:targetActivity": ".MainActivity", "android:enabled": "false" },
            "intent-filter": [
              { action: [named("android.intent.action.MAIN")], category: [named("android.intent.category.LAUNCHER")] },
            ],
          })),
        },
      ],
    },
  };
}

async function runPlugin(manifest: Node) {
  const cfg = plugin({ android: {}, mods: {}, _internal: {} }, ICONS);
  return (await cfg.mods.android.manifest({ modResults: manifest, modRequest: {} })).modResults as Node;
}

const aliasesOf = (m: Node): Node[] => m.manifest.application[0]["activity-alias"];
const schemesOf = (a: Node): string[] =>
  (a["intent-filter"] as Node[]).flatMap((f) => (f.data ?? []).map((d: Node) => d.$["android:scheme"]));
const launcherCount = (a: Node): number =>
  (a["intent-filter"] as Node[]).filter((f) =>
    (f.category ?? []).some((c: Node) => c.$["android:name"].endsWith("LAUNCHER"))
  ).length;

describe("every icon alias can receive deep links", () => {
  it("declares at least one dynamic icon to guard", () => {
    expect(Object.keys(ICONS).length).toBeGreaterThan(0);
  });

  it("copies MainActivity's schemes onto every alias", async () => {
    const out = await runPlugin(manifestFixture());
    const aliases = aliasesOf(out);
    expect(aliases).toHaveLength(Object.keys(ICONS).length);
    for (const alias of aliases) {
      expect(schemesOf(alias)).toEqual(["tistramobile", "exp+tistra-mobile"]);
    }
  });

  it("leaves exactly one launcher entry per alias", async () => {
    // Duplicating the MAIN/LAUNCHER filter would put two icons on the home
    // screen for every variant.
    for (const alias of aliasesOf(await runPlugin(manifestFixture()))) {
      expect(launcherCount(alias)).toBe(1);
    }
  });

  it("is idempotent — prebuild runs it repeatedly", async () => {
    const once = await runPlugin(manifestFixture());
    const twice = await runPlugin(once);
    for (const alias of aliasesOf(twice)) {
      expect(schemesOf(alias)).toEqual(["tistramobile", "exp+tistra-mobile"]);
      expect((alias["intent-filter"] as Node[]).length).toBe(2);
    }
  });

  it("does not disturb MainActivity itself", async () => {
    const out = await runPlugin(manifestFixture());
    const main = out.manifest.application[0].activity[0];
    expect(main["intent-filter"]).toHaveLength(2);
  });

  it("copies rather than shares the filter objects", async () => {
    // A shared reference would let a later mod editing one alias silently
    // rewrite every other alias and MainActivity too.
    const out = await runPlugin(manifestFixture());
    const [a, b] = aliasesOf(out);
    expect(a["intent-filter"][1]).not.toBe(b["intent-filter"][1]);
  });

  it("fails loudly if the deep-link filter ever moves off MainActivity", async () => {
    // Silently doing nothing is what shipped the bug in the first place.
    await expect(runPlugin(manifestFixture(false))).rejects.toThrow(/no intent-filter with <data>/);
  });
});

describe("the scheme the plugin propagates matches the app", () => {
  it("app.json still declares the scheme the OAuth redirect uses", () => {
    // lib/oauth.ts builds its redirect with Linking.createURL(), which
    // resolves to <scheme>://auth/callback. If the scheme changes, the
    // Supabase redirect allow-list has to change with it.
    expect(appJson.expo.scheme).toBe("tistramobile");
  });
});

describe("plugin order in app.json", () => {
  /** The fix depends entirely on this ordering and build 41 proved it.
   *
   * expo-dynamic-app-icon rebuilds the alias list from scratch on every
   * run — removeIconActivityAlias then addIconActivityAlias — so whichever
   * mod runs last wins. Expo runs the LAST-REGISTERED mod FIRST, so to run
   * *after* the icon plugin this one must be listed *before* it.
   *
   * Listed the other way round (which is how it shipped), the filters were
   * added and then immediately discarded: prebuild logged "filters per
   * alias = [2,2,2,2]" and the generated manifest still had one each.
   */
  const names: string[] = (appJson.expo.plugins as unknown[]).map((p) =>
    Array.isArray(p) ? String(p[0]) : String(p)
  );

  it("lists withAdaptiveDynamicIcons before expo-dynamic-app-icon", () => {
    const adaptive = names.indexOf("./plugins/withAdaptiveDynamicIcons");
    const dynamic = names.indexOf("expo-dynamic-app-icon");
    expect(adaptive).toBeGreaterThan(-1);
    expect(dynamic).toBeGreaterThan(-1);
    expect(adaptive).toBeLessThan(dynamic);
  });

  it("throws rather than no-op if the aliases are missing", async () => {
    // Which is what an order regression looks like from inside the mod.
    const empty = manifestFixture();
    empty.manifest.application[0]["activity-alias"] = [];
    await expect(runPlugin(empty)).rejects.toThrow(/must run AFTER expo-dynamic-app-icon/);
  });
});
