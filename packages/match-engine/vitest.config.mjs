import { defineConfig } from "vitest/config";

/** node:test 套件由 npm run test:node 单独跑，避免 vitest 报 “No test suite found”。 */
const NODE_TEST_FILES = [
  "tests/ob_bet_builder.test.mjs",
  "tests/ia_bet_builder.test.mjs",
  "tests/ray_bet_builder.test.mjs",
];

export default defineConfig({
  test: {
    include: ["tests/**/*.test.mjs"],
    exclude: NODE_TEST_FILES,
  },
});
