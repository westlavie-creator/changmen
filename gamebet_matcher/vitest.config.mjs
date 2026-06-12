import { defineConfig } from "vitest/config";

/** node:test 套件由 npm run test:node 单独跑，避免 vitest 报 “No test suite found”。 */
const NODE_TEST_FILES = [
  "engine/tests/ob_bet_builder.test.mjs",
  "engine/tests/ia_bet_builder.test.mjs",
  "engine/tests/ray_bet_builder.test.mjs",
];

export default defineConfig({
  test: {
    include: ["engine/tests/**/*.test.mjs"],
    exclude: NODE_TEST_FILES,
  },
});
