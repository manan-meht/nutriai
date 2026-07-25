// Standard Expo monorepo config — without this, Metro resolves module
// paths relative to the workspace root (since it detects the root
// package.json's `workspaces` field) instead of this app's own directory,
// and fails to find its entry point at all.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Forces every `require("react")`/`require("react-dom")` bundled by Metro
// to resolve to this app's own nested copy, regardless of which
// node_modules directory the requiring file physically lives in. Needed
// because react-native itself only ever gets hoisted to the workspace
// root (see the note below on why no nested copy of react-native exists),
// so react-native's own internal `require("react")` would otherwise
// resolve from the workspace root's node_modules — which pins a different
// React version for the main Next.js web app (see root package.json) —
// while this app's own code resolves the correct nested copy via
// nodeModulesPaths above. Two different React instances in one bundle is
// exactly the "Invalid hook call"/"Cannot read property 'useState' of
// null" crash this fixes: React's hook dispatcher lives on the module
// instance, so a component rendered by one copy can't find hooks state
// set up by the other.
//
// A plain `resolver.extraNodeModules` map does NOT achieve this — Metro
// only consults it as a fallback when normal node_modules resolution
// fails, and normal resolution here *succeeds* (it just finds the wrong,
// root-hoisted copy), so extraNodeModules alone is silently never reached.
// `resolveRequest` is the actual override hook: it runs before normal
// resolution and can unconditionally redirect specific module names.
const REACT_ALIASES = {
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-dom": path.resolve(projectRoot, "node_modules/react-dom"),
};
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const alias = REACT_ALIASES[moduleName];
  if (alias) {
    return (defaultResolveRequest ?? context.resolveRequest)(context, alias, platform);
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

// NOTE: disableHierarchicalLookup is deliberately NOT set here, unlike the
// nutriai-fresh Next.js app's original apps/mobile config it was ported
// from. That setting existed to prevent a dual-React-instance bug when
// react-native existed in BOTH this app's own nested node_modules AND the
// workspace root's — but in this app (moved over from the standalone
// tistra-mobile project), react-native and friends only ever get hoisted
// to the workspace root, no nested copy exists. Setting
// disableHierarchicalLookup with no nested copy to fall back to broke
// Metro's asset/module resolution in ways hierarchical lookup handles
// fine by default (observed: RN's own InitializeCore polyfills failing to
// load — "Cannot read property 'default' of undefined" — plus LogBox's
// icon assets 404ing because Metro assumed they lived under this app's
// own node_modules instead of walking up to find them at the root).

module.exports = config;
