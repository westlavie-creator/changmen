"use strict";

/**
 * 冷启动脚本：用 PandaScore 数据填充 canonical_teams（含 acronym 字段）
 *
 * 运行：
 *   PANDASCORE_TOKEN=xxx node seed.js
 *   node seed.js --dry-run     仅打印，不写库
 *   node seed.js --game=lol    只跑一个游戏
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../apps/backend/.env") });

const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const PANDASCORE_TOKEN = process.env.PANDASCORE_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

const DRY_RUN = process.argv.includes("--dry-run");
const GAME_FILTER = (process.argv.find((a) => a.startsWith("--game=")) || "").split("=")[1] || null;

const GAMES = {
  lol:      "lol",
  cs2:      "csgo",
  dota2:    "dota2",
  valorant: "valorant",
};

// ── PandaScore ────────────────────────────────────────────────────────────────

async function fetchTeamsPage(psEndpoint, page) {
  const url =
    `https://api.pandascore.co/${psEndpoint}/teams` +
    `?token=${PANDASCORE_TOKEN}&per_page=100&page=${page}&sort=-modified_at`;
  const res = await axios.get(url, { timeout: 10000 });
  return res.data || [];
}

async function fetchAllTeams(psEndpoint) {
  const result = [];
  for (let page = 1; ; page++) {
    const teams = await fetchTeamsPage(psEndpoint, page);
    if (!teams.length) break;
    result.push(...teams);
    await sleep(300);
    if (teams.length < 100) break;
  }
  return result.filter((t) => t.acronym && t.name);
}

// ── Supabase ──────────────────────────────────────────────────────────────────

let _sb = null;
function getSupabase() {
  if (!_sb) _sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  return _sb;
}

async function batchUpsert(table, rows, onConflict) {
  const sb = getSupabase();
  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { error } = await sb
          .from(table)
          .upsert(chunk, { onConflict, ignoreDuplicates: false });
        if (!error) { lastErr = null; break; }
        lastErr = error;
      } catch (e) {
        lastErr = e;
        console.warn(`  [batch ${i}] attempt ${attempt + 1} 失败:`, e.message);
      }
      await sleep(1000 * (attempt + 1));
    }
    if (lastErr) throw lastErr;
    await sleep(100);
  }
}

// ── 核心逻辑 ──────────────────────────────────────────────────────────────────

async function seedGame(gameCode, psEndpoint) {
  console.log(`\n[${gameCode}] 拉取 PandaScore 数据...`);
  const teams = await fetchAllTeams(psEndpoint);
  console.log(`  获取 ${teams.length} 支有效队伍`);

  if (DRY_RUN) {
    teams.slice(0, 5).forEach((t) =>
      console.log(`  示例: id=${t.id}  name="${t.name}"  acronym="${t.acronym}"`)
    );
    console.log(`  [dry-run] 跳过写库`);
    return;
  }

  // 去重：同名队伍保留 pandascore_id 最大（最新）的那条
  const byName = new Map();
  for (const t of teams) {
    const prev = byName.get(t.name);
    if (!prev || t.id > prev.id) byName.set(t.name, t);
  }
  const rows = [...byName.values()].map((t) => ({
    game: gameCode,
    name: t.name,
    acronym: t.acronym,
    pandascore_id: t.id,
    updated_at: new Date().toISOString(),
  }));

  await batchUpsert("canonical_teams", rows, "game,name");
  console.log(`  canonical_teams: upsert ${rows.length} 行`);
}

// ── 入口 ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!PANDASCORE_TOKEN) {
    console.error("❌ 缺少 PANDASCORE_TOKEN（环境变量或 .env）");
    process.exit(1);
  }
  if (!DRY_RUN && (!SUPABASE_URL || !SUPABASE_SERVICE_KEY)) {
    console.error("❌ 缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY");
    process.exit(1);
  }

  console.log(DRY_RUN ? "模式：dry-run（只打印）" : "模式：写入 Supabase");

  const games = GAME_FILTER ? { [GAME_FILTER]: GAMES[GAME_FILTER] } : GAMES;

  for (const [gameCode, psEndpoint] of Object.entries(games)) {
    if (!psEndpoint) { console.log(`[${gameCode}] 跳过（PandaScore 无数据）`); continue; }
    await seedGame(gameCode, psEndpoint);
  }

  console.log("\n✅ 完成");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

main().catch((err) => { console.error("❌", err.message); process.exit(1); });
