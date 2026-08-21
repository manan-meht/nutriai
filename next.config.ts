import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
  // @nutriai/nutrition-core (packages/nutrition-core) ships raw TypeScript
  // source, not a prebuilt package — Next needs to transpile it itself
  // rather than treating it as an already-built node_modules dependency.
  transpilePackages: ["@nutriai/nutrition-core"],
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    // Server Actions cap request bodies at 1MB by default. Coach photo
    // uploads go through an action and are validated at 8MB
    // (MAX_UPLOAD_BYTES), so every real phone photo threw before our own
    // check could run — the coach got a full-page "Something went wrong"
    // rather than a message. Headroom over 8MB covers multipart encoding.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
