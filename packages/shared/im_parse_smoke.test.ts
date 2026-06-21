import assert from "node:assert/strict";

const {
  imBetNameIsCollectible,
  parseImMapFromBetName,
  normalizeImBet,
} = await import("./im_parse.ts");

assert.equal(imBetNameIsCollectible("[全场] 获胜"), true);
assert.equal(imBetNameIsCollectible("第1局 获胜"), true);
assert.equal(imBetNameIsCollectible("第1局 手枪局"), false);
assert.equal(parseImMapFromBetName("第2局 获胜"), 2);
assert.equal(normalizeImBet({ BetName: "第3局 获胜", Odds: 1.9 }).Map, 3);

console.log("im_parse_smoke: ok");
