import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/src/__tests__/**/*.test.ts"],
  // Next.js copies package.json into .next/standalone, which jest's module
  // map then sees as a second package sharing the root's name and warns
  // about on every run ("Haste module naming collision"). Nothing under a
  // build directory is ever a test subject, so keep the crawler out.
  modulePathIgnorePatterns: ["/\\.next/", "/\\.vercel/"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: { jsx: "react", rootDir: "." } },
    ],
  },
};

export default config;
