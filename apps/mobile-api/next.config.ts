import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @nutriai/nutrition-core (../../packages/nutrition-core) ships raw
  // TypeScript source, not a prebuilt package — Next needs to transpile it
  // itself rather than treating it as an already-built node_modules
  // dependency.
  transpilePackages: ["@nutriai/nutrition-core"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
