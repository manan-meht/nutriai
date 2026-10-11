# Over-the-air updates (EAS Update)

How to ship a JavaScript or asset change to Tistra Health without a store
release, and — more importantly — how to tell when you can't.

This app is on **Expo SDK 54** with `expo-updates@29`. Read
<https://docs.expo.dev/versions/v54.0.0/sdk/updates/> rather than the
`latest` docs, which describe a newer SDK (see `AGENTS.md`).

## Current state

OTA is **configured but not yet live for anyone.**

> First OTA-enabled builds: iOS 1.0.1 (8) and Android 1.0.1 (version code
> 48), both on the `production` channel. Neither has been submitted to a
> store yet, so no user can receive an update until one is live.

Every build in the stores today — iOS 1.0.0 (7), Android version code 46 —
was built *before* `expo-updates` was added, so those binaries contain no
updates client and have no channel. They can never receive an update, and
publishing one will not reach them. **The first OTA-capable build has to go
through the App Store and Play review like any other release.** After that,
OTA works for anyone on that build or later.

## Prerequisites

```sh
npm install -g eas-cli      # 24.5.0 or newer
eas whoami                  # expect the `mandarth` account
```

All commands below run from `apps/mobile`.

## The first OTA-enabled builds

Nothing special — the configuration is already in `app.json`, so an
ordinary production build picks it up:

```sh
cd apps/mobile
eas build --platform ios --profile production
eas build --platform android --profile production
```

Then submit as usual:

```sh
eas submit --platform ios --latest
eas submit --platform android --latest
```

Build from `~/projects/nutriai-fresh`. An abandoned clone under
`~/Documents` produced one stale build during the iOS launch.

## Publishing an update

```sh
cd apps/mobile
npm run update:preview        # internal builds on the preview channel
npm run update:production     # everyone on a production store build
```

Both are thin wrappers that name the channel and environment explicitly:

```
eas update --channel preview    --environment preview
eas update --channel production --environment production
```

**Test on preview first.** A preview build is a real release build on its
own channel, so it exercises the actual update path — unlike Expo Go, which
ignores `expo-updates` entirely and can never be used to test this.

Nothing publishes automatically. There is no CI in this repository, and
`eas update --auto` is deliberately not used anywhere: it takes the channel
from the current git branch, which turns publishing to production into
something that can happen because of which branch you had checked out. A
test asserts that no script uses it.

## What can go over the air, and what cannot

OTA replaces the JavaScript bundle and the assets it references. It cannot
change native code, which is already compiled into the installed binary.

**Fine over the air**

- Screens, components, hooks, business logic — anything under `src/`
- Copy and styling
- Images referenced from JS via `require`
- Most dependency bumps that are pure JavaScript

**Requires a new build and a store release**

- Adding, removing or upgrading any package with native code
- Changes to `app.json`: permissions, plugins, `infoPlist`, the plugin
  list, `expo-build-properties`
- Anything under `plugins/` (the local config plugins)
- `assets/images/icon.png` and `assets/images/splash-icon.png`
- `eas.json` and `apps/mobile/.gitignore` — surprising, but both are
  fingerprint inputs (see below)
- Bumping `version`

If you are unsure, the fingerprint answers it definitively:

```sh
npm run update:fingerprint    # resolves the runtime version for both platforms
```

Run it before and after your change. If the value moves, the change needs a
build; if it doesn't, OTA will reach existing binaries.

## Runtime compatibility

`runtimeVersion` is set to `{ "policy": "fingerprint" }`. An update is only
offered to a binary advertising the same runtime version, and the
fingerprint is recomputed from everything that affects the native runtime.
So an update that depends on native code a binary doesn't have simply has
nowhere to land — it is never delivered, rather than delivered and crashing.

The cost is that native changes require more frequent builds. That is the
intended trade.

**Bumping `version` ends the OTA lineage.** Measured on both platforms: a
change from 1.0.0 to 1.0.1 moves the runtime version, so an update
published afterwards can only reach binaries built from the new version.
The practical consequences:

- Bump `version` only when you intend a store release. Bumping it as
  housekeeping silently orphans everyone on the previous build from future
  updates.
- To OTA-fix a shipped build, publish while `app.json` still carries that
  build's version. If you have already bumped, you are publishing for a
  binary that does not exist yet.

Verified for this project by resolving the runtime version under several
conditions:

- The generated `ios/` and `android/` directories are **not** fingerprint
  inputs, because they are gitignored and `@expo/fingerprint` skips ignored
  paths. The resolved runtime version is byte-identical whether or not they
  exist on the machine, which matters because EAS builds from the git
  archive, which contains neither.
- `.gitignore` itself *is* an input (that is how the exclusion above is
  decided), as is `eas.json`. Editing either changes the runtime version.
- The project's own inputs are `package.json`, `app.json`, `eas.json`,
  `.gitignore`, `plugins/*.js`, and the icon and splash images. The rest are
  native dependencies under `node_modules` — **including the patched
  `expo-dynamic-app-icon`**, which is where this bit us (see below).

### When the fingerprint doesn't match EAS

EAS compares the runtime version it calculates against the one your machine
calculated and **fails the build** on a mismatch, printing a diff of the
differing fingerprint sources. That is a good failure: it is loud, it
happens before anything ships, and the diff names the culprit. Updates are
never silently published against a runtime version no binary advertises.

It happened on the first OTA-enabled Android build, and the cause is worth
knowing because it will recur. The diff was a single source:

```
changed: node_modules/expo-dynamic-app-icon/android  (expoAutolinkingAndroid)
```

`patch-package` had applied `patches/expo-dynamic-app-icon+1.2.0.patch`
correctly on both sides. The local copy had simply **drifted** from the
committed patch — a blank line's trailing whitespace and a missing final
newline, plus stray `build/` and `.gradle/` output from a previous local
Android build. All functionally inert, all hash-relevant.

The recovery, which is also the diagnosis:

```sh
# from the repo root
rm -rf node_modules/<package>
npm pack <package>@<version> && tar xzf <package>-<version>.tgz   # or: npm ci
mv package node_modules/<package>
npx patch-package
cd apps/mobile && npm run update:fingerprint
```

Then compare against the value in the failed build's log. `npm ci` at the
root does the same thing less surgically and is the right move if more than
one package has drifted.

The general rule: **never edit `node_modules` directly.** Patch it through
`patches/` and let `patch-package` apply it, or the build machine and your
machine stop agreeing about what the native runtime is. Beware editors that
trim whitespace on save — a formatter pointed at `node_modules` is enough to
break a build this way.

## Environments

`EXPO_PUBLIC_*` values are **inlined into the bundle when it is published**,
not read at runtime. An update therefore carries whichever environment's
values were used at publish time, which is why every build profile in
`eas.json` pins both a channel and an environment, and why the release
scripts pass `--environment` explicitly:

| Profile | Channel | Environment |
|---|---|---|
| `development` | `development` | `development` |
| `preview` | `preview` | `preview` |
| `production` | `production` | `production` |

Values live server-side in EAS (`eas env:list --environment production`),
not in a local `.env`, so a publish from any machine uses the same ones. All
five are public by design — the Supabase anon key, the RevenueCat public SDK
keys and the API URL. **No secret belongs in any of them**; anything in an
`EXPO_PUBLIC_` variable is readable by anyone who downloads the app.

## Rolling back a bad update

```sh
cd apps/mobile
npm run update:rollback       # eas update:rollback, interactive
```

It offers two kinds of rollback: back to a previously published update, or
back to the update embedded in the binary.

Limitations worth knowing before you rely on this:

- A rollback is itself published as a directive, so it only takes effect on
  a client's **next update check**, which happens at cold launch. Someone
  already running the bad bundle keeps running it until they relaunch.
- A client that cannot reach the update server stays on whatever it has.
- It is per channel and per branch, so a rollback on `production` leaves
  `preview` alone.
- `expo-updates` also rolls back automatically on its own if a new update
  fails to launch at all. That safety net covers a bundle that crashes
  immediately — not one that launches fine and is merely wrong, which is
  what the manual rollback is for.

The honest summary: rollback limits the damage, it does not undo it. Publish
to `preview` and open the app first.

## Store policy

OTA must not be used to change what the app substantively does without
review. Apple's guideline 3.3.1 permits updating JavaScript as long as it
does not materially alter the app's features or purpose, and Google's Device
and Network Abuse policy is equivalent. Bug fixes, copy, layout and
refinements are fine. A new feature, a change to what data is collected, or
anything that would alter the store listing or the privacy answers goes
through a store release.

Note that the App Privacy answers in `store-assets/app-store-listing.md` are
about what the app collects. OTA does not change them — but shipping code
that collects something new *would*, and that is precisely a case for a
store release rather than an update.

## Store-update prompts

Separate from OTA, and separate from each other:

- **Android, "a newer build exists":** Google Play's own In-App Update API,
  already in `src/lib/check-for-update.ts`. FLEXIBLE, not IMMEDIATE — it
  downloads in the background and never blocks use. No configuration to
  maintain; uploading to a track is enough.
- **Either platform, "this build is retired":** `GET /app-version-policy` on
  mobile-api returns `minimumSupportedBuild` and `latestBuild` per platform,
  from these worker variables:

  ```
  APP_MIN_SUPPORTED_BUILD_IOS       APP_LATEST_BUILD_IOS
  APP_MIN_SUPPORTED_BUILD_ANDROID   APP_LATEST_BUILD_ANDROID
  ```

  All unset today, and unset means **0**, which blocks nobody. Only
  `minimumSupportedBuild` can block, and only for builds strictly below it.
  A newer version merely existing never blocks anyone, and a failed or
  malformed config response resolves to "supported" — the gate is the one
  piece of client logic that could lock a paying user out of an app that
  works, so every uncertain case lets them in. See
  `src/lib/version-policy.ts`.

  Raising the minimum is a variable change plus a redeploy of mobile-api.
  Do it only when a build genuinely cannot function.

## Device test checklist

Needs a **release or preview build on a real device** — Expo Go cannot test
any of this.

1. **Quiet download, applied on next cold launch.** Install the build,
   publish an update with a visible copy change, reopen the app. Expect: no
   dialog, no reload, the old copy still showing. Fully quit and reopen.
   Expect the new copy, with no prompt at any point.
2. **Offline startup.** Enable airplane mode, cold launch. Expect a normal
   launch on the cached or embedded bundle with no delay — `app.json` sets
   `fallbackToCacheTimeout: 0` so launch never waits on the network.
3. **Failed download.** Launch on a deliberately flaky or blocked network.
   Expect a normal launch and no error surfaced to the user.
4. **Runtime incompatibility.** Change a native input (add a native package,
   or edit `app.json`'s plugin list), publish to the same channel, and
   confirm the old binary never picks it up. `npm run update:fingerprint`
   should show a different runtime version.
5. **Login and data persistence.** Sign in, log a meal, then let an update
   apply on the next cold launch. Expect the session intact and no data
   lost — SecureStore and AsyncStorage survive an update; only the JS bundle
   is replaced.
6. **Store prompts.** Android: upload a higher version code to the track you
   installed from and confirm the FLEXIBLE prompt appears and is dismissible.
   Minimum-supported: set `APP_MIN_SUPPORTED_BUILD_IOS` above the installed
   build on a staging worker and confirm the "Time for an update" screen
   appears; unset it and confirm the app starts normally again.
7. **Diagnostics.** Submit in-app feedback and check the stored `client`
   string carries `ch=`, `rt=` and `upd=` — that is what identifies which
   bundle a bug report came from.
