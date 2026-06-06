"use strict";

/**
 * 测试脚本
 *
 * 运行前：
 *   npm install
 *   export PANDASCORE_TOKEN=your_token_here   （或在下方直接赋值）
 *
 * 运行：
 *   node test.js
 *   node test.js --no-pandascore    仅测试 Liquipedia
 *   node test.js --fresh            清空缓存后重新查询
 */

const resolver = require("./index");
const cache = require("./cache");
const pandascore = require("./providers/pandascore");

// ── 可选：直接在此处设置 token（不提交到 git）──
// pandascore.setToken("your_token_here");

const noPandascore = process.argv.includes("--no-pandascore");
const fresh = process.argv.includes("--fresh");

if (noPandascore) {
  process.env.PANDASCORE_TOKEN = "";
}
if (fresh) {
  cache.clear();
  console.log("缓存已清空\n");
}

// ── 测试用例 ──────────────────────────────────────────────
const CASES = [
  // CS2 — 缩写
  { teamName: "NaVi",        gameCode: "cs2",  expect: "Natus Vincere" },
  { teamName: "NAVI",        gameCode: "cs2",  expect: "Natus Vincere" },
  { teamName: "G2",          gameCode: "cs2",  expect: "G2 Esports" },
  { teamName: "FaZe",        gameCode: "cs2",  expect: "FaZe Clan" },
  { teamName: "Vitality",    gameCode: "cs2",  expect: "Team Vitality" },
  // LOL — 中国队伍缩写
  { teamName: "EDG",         gameCode: "lol",  expect: "Edward Gaming" },
  { teamName: "JDG",         gameCode: "lol",  expect: "JD Gaming" },
  { teamName: "BLG",         gameCode: "lol",  expect: "Bilibili Gaming" },
  { teamName: "FPX",         gameCode: "lol",  expect: "FunPlus Phoenix" },
  { teamName: "RNG",         gameCode: "lol",  expect: "Royal Never Give Up" },
  { teamName: "T1",          gameCode: "lol",  expect: "T1" },
  { teamName: "Gen.G",       gameCode: "lol",  expect: "Gen.G" },
  // Dota2
  { teamName: "OG",          gameCode: "dota2", expect: "OG" },
  { teamName: "Liquid",      gameCode: "dota2", expect: "Team Liquid" },
  // Valorant
  { teamName: "Sentinels",   gameCode: "valorant", expect: "Sentinels" },
  { teamName: "LOUD",        gameCode: "valorant", expect: "LOUD" },
];

// ── 运行 ──────────────────────────────────────────────────
async function run() {
  console.log(`PandaScore: ${pandascore.isConfigured() ? "✅ 已配置" : "❌ 未配置（仅测试 Liquipedia）"}\n`);
  console.log(
    "队名".padEnd(20) +
    "游戏".padEnd(10) +
    "结果".padEnd(35) +
    "ID".padEnd(30) +
    "置信度".padEnd(8) +
    "来源"
  );
  console.log("─".repeat(110));

  let pass = 0, fail = 0, skip = 0;

  for (const c of CASES) {
    let result;
    try {
      result = await resolver.resolve(c.teamName, c.gameCode);
    } catch (err) {
      result = null;
      console.error(`  ERROR: ${c.teamName}/${c.gameCode}: ${err.message}`);
    }

    if (!result) {
      skip++;
      console.log(
        c.teamName.padEnd(20) +
        c.gameCode.padEnd(10) +
        "NULL".padEnd(35) +
        "—".padEnd(30) +
        "—".padEnd(8) +
        "—"
      );
      continue;
    }

    const nameMatch = result.name?.toLowerCase().includes(c.expect.toLowerCase()) ||
                      c.expect.toLowerCase().includes(result.name?.toLowerCase() || "");
    if (nameMatch) pass++; else fail++;

    const status = nameMatch ? "✅" : "❌";
    console.log(
      (c.teamName).padEnd(20) +
      c.gameCode.padEnd(10) +
      (result.name || "").padEnd(35) +
      (result.id || "").padEnd(30) +
      String((result.confidence || 0).toFixed(2)).padEnd(8) +
      `${result.source} (${result.matchType || ""}) ${status}`
    );
  }

  console.log("\n" + "─".repeat(110));
  console.log(`结果：✅ ${pass} 通过  ❌ ${fail} 失败  — ${skip} 未解析`);

  // ── 额外：测试 scoreMatchPair ──────────────────────────
  console.log("\n\n── scoreMatchPair 测试 ─────────────────────────────\n");

  const pairTests = [
    {
      label: "EDG vs FPX (lol) — 同一场不同命名",
      a: { home: "EDG",             away: "FPX",               gameCode: "lol", startTimeMs: Date.now() },
      b: { home: "Edward Gaming",   away: "FunPlus Phoenix",   gameCode: "lol", startTimeMs: Date.now() + 60000 },
    },
    {
      label: "NaVi vs G2 (cs2) — 缩写 vs 缩写",
      a: { home: "NaVi",  away: "G2",        gameCode: "cs2", startTimeMs: Date.now() },
      b: { home: "NAVI",  away: "G2 Esports", gameCode: "cs2", startTimeMs: Date.now() + 30000 },
    },
  ];

  for (const t of pairTests) {
    console.log(`测试: ${t.label}`);
    try {
      const score = await resolver.scoreMatchPair(t.a, t.b);
      console.log(`  shouldMerge: ${score.shouldMerge}  confidence: ${score.confidence?.toFixed(2)}  reason: ${score.reason}${score.reversed ? "  [reversed]" : ""}`);
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
    console.log();
  }
}

run().catch(console.error);
