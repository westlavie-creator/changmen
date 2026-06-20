#!/usr/bin/env node
/**
 * 诊断：检查 client_matches 的数据质量和 PB 覆盖率。
 */

import "../lib/env.js";
import { fetchClientMatches } from "@changmen/db";
import { SHARP_PLATFORM, SOFT_PLATFORMS } from "../lib/config.js";
import { removVig } from "../engine/fair_odds.js";

const matches = await fetchClientMatches();

if (!matches || matches.length === 0) {
  console.log("❌ client_matches 表为空（无比赛数据）");
  process.exit(0);
}

console.log(`✅ client_matches 共 ${matches.length} 场比赛\n`);

let totalBets = 0;
let betsWithSharp = 0;
let betsWithAnySoft = 0;
const platformCoverage = {};
const edgeDistribution = { "<0%": 0, "0-1%": 0, "1-2%": 0, "2-3%": 0, "3-5%": 0, "5-10%": 0, ">10%": 0 };
const allEdges = [];

for (const match of matches) {
  const bets = match.bets;
  if (!bets) continue;
  const betRows = Array.isArray(bets) ? bets : bets.Bets || bets.bets || [];

  for (const bet of betRows) {
    const sources = bet.Sources || bet.sources;
    if (!sources) continue;
    totalBets++;

    for (const p of Object.keys(sources)) {
      platformCoverage[p] = (platformCoverage[p] || 0) + 1;
    }

    const sharp = sources[SHARP_PLATFORM];
    if (!sharp) continue;
    betsWithSharp++;

    const hasSoft = SOFT_PLATFORMS.some((p) => sources[p] && sources[p].Status !== "Locked");
    if (hasSoft) betsWithAnySoft++;

    const fair = removVig(sharp.HomeOdds, sharp.AwayOdds);
    if (!fair) continue;

    for (const p of SOFT_PLATFORMS) {
      const src = sources[p];
      if (!src || src.Status === "Locked") continue;

      for (const side of ["Home", "Away"]) {
        const softOdds = side === "Home" ? src.HomeOdds : src.AwayOdds;
        const fairOdds = side === "Home" ? fair.fairHome : fair.fairAway;
        if (!softOdds || softOdds <= 1) continue;

        const edge = softOdds / fairOdds - 1;
        allEdges.push({ edge, platform: p, side, softOdds, fairOdds, match: match.title, bet: bet.Name || bet.name });

        if (edge < 0) edgeDistribution["<0%"]++;
        else if (edge < 0.01) edgeDistribution["0-1%"]++;
        else if (edge < 0.02) edgeDistribution["1-2%"]++;
        else if (edge < 0.03) edgeDistribution["2-3%"]++;
        else if (edge < 0.05) edgeDistribution["3-5%"]++;
        else if (edge < 0.10) edgeDistribution["5-10%"]++;
        else edgeDistribution[">10%"]++;
      }
    }
  }
}

console.log("── 盘口统计 ──");
console.log(`  总盘口数: ${totalBets}`);
console.log(`  有 ${SHARP_PLATFORM} 基准的盘口: ${betsWithSharp} (${totalBets ? (betsWithSharp / totalBets * 100).toFixed(1) : 0}%)`);
console.log(`  有 ${SHARP_PLATFORM} + 软盘的盘口: ${betsWithAnySoft}`);

console.log("\n── 各平台覆盖率 ──");
const sorted = Object.entries(platformCoverage).sort((a, b) => b[1] - a[1]);
for (const [p, count] of sorted) {
  const pct = (count / totalBets * 100).toFixed(1);
  const bar = "█".repeat(Math.round(count / totalBets * 30));
  console.log(`  ${p.padEnd(6)} ${String(count).padStart(4)} (${pct.padStart(5)}%) ${bar}`);
}

console.log("\n── Edge 分布（PB vs 软盘，所有盘口所有方向）──");
for (const [range, count] of Object.entries(edgeDistribution)) {
  const bar = "█".repeat(Math.min(50, Math.round(count / Math.max(1, allEdges.length) * 100)));
  console.log(`  ${range.padEnd(6)} ${String(count).padStart(5)} ${bar}`);
}

if (allEdges.length > 0) {
  allEdges.sort((a, b) => b.edge - a.edge);
  console.log("\n── Top 10 最高 Edge ──");
  for (const e of allEdges.slice(0, 10)) {
    console.log(
      `  ${(e.edge * 100).toFixed(2)}%`.padEnd(9) +
      `${e.platform.padEnd(6)} ${e.side.padEnd(5)}` +
      `  soft=${e.softOdds.toFixed(3)}  fair=${e.fairOdds.toFixed(3)}` +
      `  ${e.match} | ${e.bet}`,
    );
  }

  console.log("\n── Top 10 最低 Edge（负值 = 软盘低于公平赔率）──");
  for (const e of allEdges.slice(-10).reverse()) {
    console.log(
      `  ${(e.edge * 100).toFixed(2)}%`.padEnd(9) +
      `${e.platform.padEnd(6)} ${e.side.padEnd(5)}` +
      `  soft=${e.softOdds.toFixed(3)}  fair=${e.fairOdds.toFixed(3)}` +
      `  ${e.match} | ${e.bet}`,
    );
  }
}

// 展示几场比赛的 Sources 结构样例
console.log("\n── 比赛数据样例（前3场）──");
for (const match of matches.slice(0, 3)) {
  console.log(`\n  [${match.game}] ${match.title} (id=${match.id})`);
  const bets = match.bets;
  if (!bets) { console.log("    (无 bets)"); continue; }
  const betRows = Array.isArray(bets) ? bets : bets.Bets || bets.bets || [];
  for (const bet of betRows.slice(0, 2)) {
    const sources = bet.Sources || bet.sources || {};
    const platforms = Object.keys(sources);
    console.log(`    盘口: ${bet.Name || bet.name} Map=${bet.Map ?? bet.map} | 平台: ${platforms.join(",")}`);
    for (const p of platforms.slice(0, 4)) {
      const s = sources[p];
      console.log(`      ${p}: Home=${s.HomeOdds} Away=${s.AwayOdds} Status=${s.Status || "?"}`);
    }
  }
}

console.log();
process.exit(0);
