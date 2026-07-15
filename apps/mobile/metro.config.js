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
