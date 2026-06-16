export const DEFAULT_ODDS_FILE = "default_odds";

export function createDefaultOddsApi(readJson, writeJson, options = {}) {
  const persist =
    typeof options.writeDebounced === "function"
      ? options.writeDebounced
      : writeJson;

  function readStore() {
    const raw = readJson(DEFAULT_ODDS_FILE, {});
    return raw && typeof raw === "object" ? raw : {};
  }

  function writeStore(store) {
    persist(DEFAULT_ODDS_FILE, store);
  }

  /** Map=0 全场盘：从各平台 platform_bets 原始行取主客最大赔（决胜局裁剪后兜底） */
  function snapshotMapZeroFromPlatformBets(match, map0Bet, platformBetsByKey) {
    if (!map0Bet || (Number(map0Bet.Map) || 0) !== 0) return {};
    let home = Number(map0Bet.InitialHomeOdds) || 0;
    let away = Number(map0Bet.InitialAwayOdds) || 0;
    const matchs = match.Matchs || match.matchs || {};
    for (const [platform, sourceMatchId] of Object.entries(matchs)) {
      const block = platformBetsByKey?.[`${platform}:${sourceMatchId}`];
      if (!block?.bets?.length) continue;
      for (const b of block.bets) {
        if ((Number(b.Map) || 0) !== 0) continue;
        home = Math.max(home, Number(b.HomeOdds) || 0);
        away = Math.max(away, Number(b.AwayOdds) || 0);
      }
    }
    const id = Number(map0Bet.ID);
    if (!id) return {};
    const out = {};
    if (home > 0) out[`${id}:Home`] = home;
    if (away > 0) out[`${id}:Away`] = away;
    return out;
  }

  function mergeSnapshotIntoStore(store, snap) {
    let changed = false;
    for (const [key, odds] of Object.entries(snap || {})) {
      if (odds > 0 && !store[key]) {
        store[key] = odds;
        changed = true;
      }
    }
    return changed;
  }

  /** 从合并列表各盘 Sources（及 Map=0 裁剪前保留的 Initial*）取主客最大赔 */
  function snapshotFromBets(bets) {
    const out = {};
    for (const bet of bets || []) {
      let home = Number(bet.InitialHomeOdds) || 0;
      let away = Number(bet.InitialAwayOdds) || 0;
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

  async function pruneStaleKeys(buildMatchList) {
    const activeBetIds = new Set();
    for (const match of (await buildMatchList()) || []) {
      for (const bet of match.Bets || []) {
        const id = Number(bet.ID);
        if (id) activeBetIds.add(id);
      }
    }
    const store = readStore();
    let changed = false;
    for (const key of Object.keys(store)) {
      const betId = Number(String(key).split(":")[0]);
      if (!activeBetIds.has(betId)) {
        delete store[key];
        changed = true;
      }
    }
    if (changed) writeStore(store);
  }

  async function loadPlatformBets(fetchPlatformBets) {
    if (typeof fetchPlatformBets !== "function") return {};
    try {
      const raw = await fetchPlatformBets();
      return raw && typeof raw === "object" ? raw : {};
    } catch {
      return {};
    }
  }

  async function getMatchDefaultOdds(matchIds, buildMatchList, fetchPlatformBets) {
    const wanted = new Set((matchIds || []).map((id) => Number(id)).filter(Boolean));
    const out = {};
    if (!wanted.size) return out;

    await pruneStaleKeys(buildMatchList);
    const matches = (await buildMatchList()) || [];
    recordFromMatchList(matches);
    const platformBets = await loadPlatformBets(fetchPlatformBets);
    const store = readStore();
    let storeChanged = false;
    for (const match of matches) {
      if (!wanted.has(Number(match.ID))) continue;
      const snap = snapshotFromBets(match.Bets);
      const map0Bet = (match.Bets || []).find((b) => (Number(b.Map) || 0) === 0);
      if (map0Bet) {
        const pbSnap = snapshotMapZeroFromPlatformBets(match, map0Bet, platformBets);
        for (const [key, odds] of Object.entries(pbSnap)) {
          if (odds > 0 && (!snap[key] || snap[key] <= 0)) snap[key] = odds;
        }
        if (mergeSnapshotIntoStore(store, pbSnap)) storeChanged = true;
      }
      for (const bet of match.Bets || []) {
        const betId = Number(bet.ID);
        if (!betId) continue;
        for (const side of ["Home", "Away"]) {
          const key = `${betId}:${side}`;
          const fromSnap = snap[key] || 0;
          const fromStore = Number(store[key]) || 0;
          const odds = fromStore > 0 ? fromStore : fromSnap;
          if (odds > 0) out[key] = odds;
        }
      }
    }
    if (storeChanged) writeStore(store);
    return out;
  }

  async function getDefaultOddsSingle(betId, team, buildMatchList, fetchPlatformBets) {
    const key = `${Number(betId)}:${team}`;
    const store = readStore();
    if (store[key] > 0) return store[key];

    const matches = (await buildMatchList()) || [];
    const platformBets = await loadPlatformBets(fetchPlatformBets);
    for (const match of matches) {
      for (const bet of match.Bets || []) {
        if (Number(bet.ID) !== Number(betId)) continue;
        const snap = snapshotFromBets([bet]);
        if (snap[key] > 0) return snap[key];
        if ((Number(bet.Map) || 0) === 0) {
          const pbSnap = snapshotMapZeroFromPlatformBets(match, bet, platformBets);
          if (pbSnap[key] > 0) {
            mergeSnapshotIntoStore(store, pbSnap);
            writeStore(store);
            return pbSnap[key];
          }
        }
        return 0;
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
