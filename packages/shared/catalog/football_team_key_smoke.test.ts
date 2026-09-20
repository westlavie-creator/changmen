/**
 * football_team_key 冒烟：足球归一化 / 别名 canonical / 配对键（联赛码 + 队名对 + 小时桶）。
 * 单一来源：server sport_team_plugin 与 client 足球合场共用，禁止各自复制。
 */
import assert from "node:assert/strict";
import {
  canonicalFootballTeamPair,
  normFootballTeamName,
  resolveFootballTeamKey,
} from "./football_team_key.ts";

// 归一化：小写 + 去重音 + 去撇号 + &→and + 非字母数字→空格
assert.equal(normFootballTeamName("CF América"), "cf america");
assert.equal(normFootballTeamName("A's"), "as");
assert.equal(normFootballTeamName("AT&T"), "at and t");
assert.equal(normFootballTeamName("曼城"), "曼城");
assert.equal(normFootballTeamName("  Club   America  "), "club america");

// canonical：别名表 + 去填充词（fc/cf/cd/sc/ac/fk/club）
assert.equal(resolveFootballTeamKey("Manchester City"), "manchester city");
assert.equal(resolveFootballTeamKey("Man City"), "manchester city");
assert.equal(resolveFootballTeamKey("曼城"), "manchester city");
assert.equal(resolveFootballTeamKey("CF América"), "america");
assert.equal(resolveFootballTeamKey("Club America"), "america");
assert.equal(resolveFootballTeamKey("CD Guadalajara"), "guadalajara");
assert.equal(resolveFootballTeamKey("CD Guadalajara Chivas"), "guadalajara");
assert.equal(resolveFootballTeamKey("Chivas"), "guadalajara");
assert.equal(resolveFootballTeamKey(""), "");

// 配对键：排序队名对（朝向无关），null 当任一侧为空
const pair = canonicalFootballTeamPair("CF América", "CD Guadalajara Chivas");
assert.deepEqual(pair, ["america", "guadalajara"]);
assert.deepEqual(
  canonicalFootballTeamPair("CD Guadalajara Chivas", "Club America"),
  pair,
  "sorted pair must be orientation-independent",
);
assert.equal(canonicalFootballTeamPair("Club America", ""), null);
assert.equal(canonicalFootballTeamPair("大", "小"), null, "outcome labels are not teams");

console.log("football_team_key.smoke: ok");
