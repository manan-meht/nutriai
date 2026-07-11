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

// Without this, Metro's default hierarchical lookup can still resolve
// "react" (and other packages exact-pinned to a different version here
// than in the root app, e.g. react-native's peer requirement) from the
// workspace root's node_modules for some files even though this app's own
// node_modules already has the correct nested copy — bundling two
// distinct React module instances together, which breaks all hooks with
// "Cannot read property 'useState' of null". Restricting resolution to
// exactly the ordered nodeModulesPaths above forces a single instance.
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
