import { defineConfig } from "vitest/config";

/**
 * Network test config — separate from the unit-test config so live Overpass
 * tests are opt-in via `npm run test:network`. Single fork so we don't
 * hammer one Overpass mirror with parallel requests from multiple workers.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/network/**/*.test.js"],
    testTimeout: 120_000,
    hookTimeout: 30_000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    reporters: ["verbose"],
  },
});
