import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: [".next/**", "node_modules/**", "public/**", ".vercel/**", "apps/*/.vercel/**"],
  },
];

export default config;
