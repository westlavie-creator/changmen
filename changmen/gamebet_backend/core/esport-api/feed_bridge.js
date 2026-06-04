"use strict";

const store = require("./store.js");
const { formatOdds } = require("../shared/odds_format.js");
const dbStore = require("../db/store.js");

const SYNC_MS = Number(process.env.ESPORT_BRIDGE_MS || 3000);
/** 默认开启；设 ESPORT_BRIDGE=0 可关闭（仅调试用） */
const ENABLED = process.env.ESPORT_BRIDGE !== "0";

function teamRef(match, side) {
  const raw = match[side];
  if (raw && typeof raw === "object") {
    return { id: String(raw.id || ""), name: String(raw.name || "") };
  }
  return { id: "", name: String(raw || "") };
}

function betNameForStage(stage) {
  const id = stage.stageId ?? 0;
  if (id === 0) return "全场胜负";
  return stage.label || `[地图${id}] 获胜`;
}

function stageToBet(provider, match, stage) {
  if (!stage || (!stage.winHomeId && !stage.winAwayId)) return null;
  const home = teamRef(match, "home");
  const away = teamRef(match, "away");
  const map = stage.stageId ?? 0;
  const locked = Boolean(stage.winLocked) || stage.winHome == null || stage.winAway == null;
  const betId = stage.winMarketId || `${match.matchId}:${map}`;
  const row = {
    Type: provider,
    SourceMatchID: String(match.matchId),
    Map: map,
    SourceBetID: String(betId),
    BetName: betNameForStage(stage),
    SourceHomeID: String(stage.winHomeId || `${match.matchId}:home:${map}`),
    HomeName: home.name,
    HomeOdds: formatOdds(stage.winHome),
    SourceAwayID: String(stage.winAwayId || `${match.matchId}:away:${map}`),
    AwayName: away.name,
    AwayOdds: formatOdds(stage.winAway),
    Status: locked ? "Locked" : "Normal",
  };
  if (provider === "OB" && stage.winOddTypeId) {
    row.OddTypeID = String(stage.winOddTypeId);
  }
  if (provider === "RAY" && stage.winMarket) {
    row.GroupName = String(stage.winMarket);
  }
  return row;
}

function matchToSave(provider, match) {
  const home = teamRef(match, "home");
  const away = teamRef(match, "away");
  const gameId = String(match.gameId || match.gameCode || "");
  return {
    SourceMatchID: String(match.matchId),
    SourceGameID: gameId,
    Type: provider,
    StartTime: Number(match.startTime) || Date.now(),
    HomeID: home.id || String(match.matchId),
    Home: home.name,
    AwayID: away.id || String(match.matchId),
    Away: away.name,
    BO: Number(match.bo) || 0,
    Teams: [
      {
        Type: provider,
        TeamID: home.id || String(match.matchId),
        Name: home.name,
        GameID: gameId,
        Logo: "",
      },
      {
        Type: provider,
        TeamID: away.id || String(match.matchId),
        Name: away.name,
        GameID: gameId,
        Logo: "",
      },
    ],
  };
}

function syncPlatform(provider, instance) {
  if (!instance) return { matches: 0, bets: 0 };
  const matchRows = [];
  let betCount = 0;

  for (const match of instance.matches) {
    // 比赛列表来自 index 快照；赔率可稍后由 loadMatchOdds 写入 byMatch。
    // 若要求 byMatch 才入库，OB 会在 sync 后首帧把 OB:{} 写盘并盖住前端 SaveMatch。
    matchRows.push(matchToSave(provider, match));
    const detail = instance.byMatch?.[match.matchId];
    if (!detail) continue;
    const stages = detail.stages?.length
      ? detail.stages
      : [{
          stageId: 0,
          label: "全场",
          winHome: detail.winHome,
          winAway: detail.winAway,
          winHomeId: detail.winHomeId,
          winAwayId: detail.winAwayId,
          winLocked: detail.winLocked,
          winMarketId: detail.winMarketId,
        }];
    const bets = stages.map((s) => stageToBet(provider, match, s)).filter(Boolean);
    if (bets.length) {
      store.saveBets(provider, match.matchId, bets);
      betCount += bets.length;
    }
  }

  if (provider === "OB" && matchRows.length) {
    dbStore.saveObMatches(matchRows);
    dbStore.pruneObMatches(matchRows.map((m) => String(m.SourceMatchID)));
  }

  store.saveMatches(provider, matchRows);
  return { matches: matchRows.length, bets: betCount };
}

function syncHub(hub) {
  let matches = 0;
  let bets = 0;
  for (const p of hub.platforms || []) {
    if (!p.enabled || !p.instance) continue;
    const r = syncPlatform(p.id, p.instance);
    matches += r.matches;
    bets += r.bets;
  }
  return { matches, bets };
}

function attachFeedBridge(hub) {
  if (!ENABLED) {
    return { enabled: false, sync: () => ({ matches: 0, bets: 0 }) };
  }

  let timer = null;
  let pending = false;

  const run = () => {
    pending = false;
    try {
      return syncHub(hub);
    } catch (err) {
      console.error("[esport-bridge] sync failed:", err.message);
      return { matches: 0, bets: 0, error: err.message };
    }
  };

  const schedule = () => {
    if (pending) return;
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, SYNC_MS);
  };

  hub.on((event) => {
    if (event.type === "snapshot") schedule();
  });

  return {
    enabled: true,
    sync: run,
    schedule,
  };
}

module.exports = { attachFeedBridge, syncHub, syncPlatform };
