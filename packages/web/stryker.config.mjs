/**
 * Stryker Mutation Testing Configuration (L32)
 *
 * Run: npx stryker run (after: pnpm add -D @stryker-mutator/core @stryker-mutator/vitest-runner)
 *
 * Mutation testing verifies test quality by inserting small code changes
 * ("mutants") and checking that tests catch them. A survived mutant means
 * a test gap exists.
 *
 * This is configured as informational — not blocking CI. Run periodically
 * to identify test coverage gaps in critical paths.
 */
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: {
    configFile: "vitest.config.ts",
  },
  mutate: [
    // Focus on critical business logic, not UI components
    "lib/encryption.ts",
    "lib/permissions.ts",
    "lib/check-member-permission.ts",
    "lib/rate-limit.ts",
    "lib/search-query.ts",
    "lib/internal-auth.ts",
    "lib/admin-auth.ts",
    "lib/api-safety.ts",
  ],
  reporters: ["clear-text", "html"],
  htmlReporter: {
    fileName: "mutation-report.html",
  },
  thresholds: {
    high: 80,
    low: 60,
    break: null, // Don't fail — informational only
  },
  timeoutMS: 30000,
  concurrency: 4,
};
