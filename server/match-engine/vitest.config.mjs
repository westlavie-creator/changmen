/** vitest 只跑 vitest API 用例；node:test 见 npm run test:node */
export default {
  test: {
    exclude: [
      "**/node_modules/**",
      "tests/match_lifecycle.test.mjs",
      "tests/match_merge_decider_promote.test.mjs",
      "tests/ob_bet_builder.test.mjs",
      "tests/ia_bet_builder.test.mjs",
      "tests/ray_bet_builder.test.mjs",
    ],
  },
};
