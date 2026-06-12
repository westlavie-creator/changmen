#!/usr/bin/env node
/**
 * OB 后端 live 冒烟（需 gamebet_backend 3560，与 dev.bat 一致）
 *
 * 默认只读：登录 → Client_GetCollectPlatform(OB) → Client_GetMatchs 抽样
 * 写入 round-trip（会临时覆盖 OB 比赛快照）：OB_SMOKE_WRITE=1
 *
 * ESPORT_TEST_BASE=http://127.0.0.1:3560 node scripts/test-ob-live-smoke.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  assert,
  defaultCredentials,
  esportPost,
  loginEsport,
  resolveEsportBase,
} from "./ob-test-helpers.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { rebuildClientMatchListNow } = require("../../gamebet_backend/core/esport-api/store.js");

const DATA_DIR = path.resolve(__dirname, "../../gamebet_backend/data/esport");
const MATCHES_PATH = path.join(DATA_DIR, "matches.json");
const BETS_PATH = path.join(DATA_DIR, "bets.json");

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function backupObStore() {
  const matches = readJson(MATCHES_PATH, {});
  const bets = readJson(BETS_PATH, {});
  return {
    obMatches: matches.OB ? { ...matches.OB } : {},
    obBetKeys: Object.fromEntries(
      Object.entries(bets).filter(([k]) => k.startsWith("OB:")),
    ),
  };
}

function restoreObStore(backup) {
  const matches = readJson(MATCHES_PATH, {});
  const bets = readJson(BETS_PATH, {});
  matches.OB = backup.obMatches;
  for (const key of Object.keys(bets)) {
    if (key.startsWith("OB:")) delete bets[key];
  }
  Object.assign(bets, backup.obBetKeys);
  fs.writeFileSync(MATCHES_PATH, `${JSON.stringify(matches, null, 2)}\n`);
  fs.writeFileSync(BETS_PATH, `${JSON.stringify(bets, null, 2)}\n`);
  rebuildClientMatchListNow();
}

function smokePayload() {
  const suffix = Date.now();
  const sourceMatchId = `ob-smoke-${suffix}`;
  const match = {
    Type: "OB",
    SourceMatchID: sourceMatchId,
    SourceGameID: "8",
    StartTime: Date.now() + 30 * 60 * 1000,
    BO: 1,
    Home: "Smoke Home",
    HomeID: "9001",
    Away: "Smoke Away",
    AwayID: "9002",
    Teams: [],
  };
  const bets = [
    {
      Type: "OB",
      SourceMatchID: sourceMatchId,
      Map: 0,
      SourceBetID: `bet-${suffix}`,
      OddTypeID: "1",
      BetName: "[全场]-全局-获胜",
      SourceHomeID: `odd-h-${suffix}`,
      HomeName: "Smoke Home",
      HomeOdds: 1.5,
      SourceAwayID: `odd-a-${suffix}`,
      AwayName: "Smoke Away",
      AwayOdds: 2.5,
      Status: "Normal",
    },
  ];
  return { sourceMatchId, match, bets };
}

async function readOnlyChecks(base, token, userName) {
  const plat = await esportPost(base, "Client_GetCollectPlatform", { provider: "OB" }, { token });
  assert(plat.json.success === 1, `GetCollectPlatform 失败: ${plat.json.msg}`);
  const info = plat.json.info || {};
  console.log("[ob-live] CollectPlatform OB", {
    gateway: info.Gateway ? `${String(info.Gateway).slice(0, 48)}…` : "(空)",
    hasToken: Boolean(info.Token),
    betName: info.BetName,
  });

  const cfg = await esportPost(base, "Client_GetData", { key: "CollectConfig" }, { token });
  const collect = cfg.json?.collect ?? cfg.json?.info?.collect;
  if (Array.isArray(collect)) {
    const obOn = collect.find(([id]) => id === "OB")?.[1];
    console.log("[ob-live] CollectConfig OB 回传", obOn ? "开" : "关（浏览器采集仍跑，但不 SaveMatch/SaveBet）");
  }

  const gm = await esportPost(
    base,
    "Client_GetMatchs",
    {},
    { token, query: `?user=${encodeURIComponent(userName)}` },
  );
  assert(gm.json.success === 1 && Array.isArray(gm.json.info), "GetMatchs 失败");
  const obRows = gm.json.info.filter((r) => r.Matchs?.OB);
  console.log("[ob-live] GetMatchs", { total: gm.json.info.length, obRows: obRows.length });
  if (obRows.length) {
    const row = obRows[0];
    assert(row.Bets?.some((b) => b.Sources?.OB), "OB 行缺 Sources.OB");
    console.log("[ob-live] 样例 OB 行", { title: row.Title, matchId: row.Matchs.OB });
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function writeRoundTrip(base, token, userName) {
  const hasLocalStore = fs.existsSync(MATCHES_PATH);
  const backup = hasLocalStore ? backupObStore() : null;
  const { sourceMatchId, match, bets } = smokePayload();
  try {
    const sm = await esportPost(
      base,
      "API_SaveMatch",
      { provider: "OB", matchs: JSON.stringify([match]) },
      { token, query: "?OB" },
    );
    assert(sm.json.success === 1, `SaveMatch 失败: ${sm.json.msg}`);

    const sb = await esportPost(
      base,
      "API_SaveBet",
      { provider: "OB", matchId: sourceMatchId, bets: JSON.stringify(bets) },
      { token, query: "?OB" },
    );
    assert(sb.json.success === 1, `SaveBet 失败: ${sb.json.msg}`);

    rebuildClientMatchListNow();
    await sleep(50);

    const gm = await esportPost(
      base,
      "Client_GetMatchs",
      {},
      { token, query: `?user=${encodeURIComponent(userName)}` },
    );
    const row = gm.json.info?.find((r) => r.Matchs?.OB === sourceMatchId);
    assert(row, "写入后 GetMatchs 未找到 smoke 行");
    const ob = row.Bets?.[0]?.Sources?.OB;
    assert(ob, "Bets[0].Sources.OB 缺失");
    assert(ob.BetID === bets[0].SourceBetID, `Sources.OB.BetID 不一致: ${ob.BetID} vs ${bets[0].SourceBetID}`);
    console.log("[ob-live] SaveMatch+SaveBet round-trip PASS", { sourceMatchId });
  } finally {
    if (backup) {
      restoreObStore(backup);
      console.log("[ob-live] 已恢复 OB matches/bets 本地快照");
    } else {
      console.log(
        "[ob-live] 无本地 matches.json（Supabase 模式）；smoke 行已写入服务端，未自动删除",
      );
    }
  }
}

async function main() {
  const base = resolveEsportBase();
  if (!base) {
    console.log("[ob-live] 跳过（无法解析 ESPORT_TEST_BASE）");
    return;
  }

  const creds = defaultCredentials();
  console.log("[ob-live] base:", base, "user:", creds.userName);

  const { token, userName } = await loginEsport(base, creds);
  console.log("[ob-live] login OK");

  await readOnlyChecks(base, token, userName);

  if (process.env.OB_SMOKE_WRITE === "1") {
    await writeRoundTrip(base, token, userName);
  } else {
    console.log("[ob-live] 未做 SaveMatch 写入（设 OB_SMOKE_WRITE=1 启用 round-trip，会自动备份/恢复 OB 数据）");
  }

  console.log("[ob-live] ALL PASS");
}

main().catch((e) => {
  console.error("[ob-live] FAIL", e.message);
  process.exit(1);
});
