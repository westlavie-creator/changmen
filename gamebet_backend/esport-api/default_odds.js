"use strict";

const DEFAULT_ODDS_FILE = "default_odds";

function createDefaultOddsApi(readJson, writeJson) {
  function readStore() {
    const raw = readJson(DEFAULT_ODDS_FILE, {});
    return raw && typeof raw === "object" ? raw : {};
  }

  function writeStore(store) {
    writeJson(DEFAULT_ODDS_FILE, store);
  }

  /** 从合并列表各盘 Sources 取主客最大赔，用于快照回退 */
  function snapshotFromBets(bets) {
    const out = {};
    for (const bet of bets || []) {
      let home = 0;
      let away = 0;
      for (const src of Object.values(bet.Sources || {})) {
        home = Math.max(home, Number(src.HomeOdds) || 0);
        away = Math.max(away, Number(src.AwayOdds) || 0);
      }
      const id = Number(bet.ID);
      if (!id) continue;
      if (home > 0) out[`${id}:Home`] = home;
      if (away > 0) out[`${id}:Away`] = away;
    }
    return out;
  }

  /** 首次见到的赔率写入 default_odds.json（只增不改） */
  function recordFromMatchList(matches) {
    const store = readStore();
    let changed = false;
    for (const match of matches || []) {
      const snap = snapshotFromBets(match.Bets);
      for (const [key, odds] of Object.entries(snap)) {
        if (odds > 0 && !store[key]) {
          store[key] = odds;
          changed = true;
        }
      }
    }
    if (changed) writeStore(store);
    return store;
  }

  function getMatchDefaultOdds(matchIds, buildMatchList) {
    const wanted = new Set((matchIds || []).map((id) => Number(id)).filter(Boolean));
    const out = {};
    if (!wanted.size) return out;

    const store = readStore();
    const matches = buildMatchList();
    for (const match of matches) {
      if (!wanted.has(Number(match.ID))) continue;
      const snap = snapshotFromBets(match.Bets);
      for (const [key, odds] of Object.entries(snap)) {
        out[key] = store[key] > 0 ? store[key] : odds;
      }
    }
    return out;
  }

  function getDefaultOddsSingle(betId, team, buildMatchList) {
    const key = `${Number(betId)}:${team}`;
    const store = readStore();
    if (store[key] > 0) return store[key];

    const matches = buildMatchList();
    for (const match of matches) {
      for (const bet of match.Bets || []) {
        if (Number(bet.ID) !== Number(betId)) continue;
        const snap = snapshotFromBets([bet]);
        return snap[key] || 0;
      }
    }
    return 0;
  }

  return {
    recordFromMatchList,
    getMatchDefaultOdds,
    getDefaultOddsSingle,
    readStore,
  };
}

module.exports = { createDefaultOddsApi, DEFAULT_ODDS_FILE };
