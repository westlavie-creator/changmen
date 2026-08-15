import {
  deleteOrphanPlatformBetsAsync,
  prunePredictFunPlatformMatches,
  syncPlatformBetsForMatchAsync,
  writePlatformMatchesAsync,
} from "@changmen/db";
import { formatPredictionMarketBetOdds } from "@changmen/shared/odds_format";

import {
  fetchPredictCategories,
  fetchPredictOrderbooks,
  predictCollectStartTimeAllowed,
  resolvePredictFunApiKey,
} from "./api.js";
import { persistPredictFunMarketIndex } from "./market_index.js";
import {
  bestAskFromPredictBook,
  buildPredictMappedMarket,
  isPredictCategoryOpenForCollect,
  isPredictEsportsMoneylineCategory,
} from "./parse.js";

const PLATFORM = "PredictFun";
const MAX_TRACKED_MARKETS = 200;

export async function runPredictFunDiscoveryCycle() {
  if (!resolvePredictFunApiKey())
    throw new Error("PREDICT_FUN_API_KEY 未配置");

  // 默认 tagIds=Esports（见 api.js）；覆盖旧 SPORTS_TEAM_MATCH→MLB 误拉
  const rawCategories = await fetchPredictCategories({ status: "OPEN" });
  const esportCategories = rawCategories.filter(isPredictEsportsMoneylineCategory);
  const inWindow = esportCategories.filter((category) => {
    const startMs = category.startsAt ? Date.parse(category.startsAt) : 0;
    return predictCollectStartTimeAllowed(startMs);
  });

  // 源头门控：Match Winner 已 PRICE_PROPOSED/结算 → 停写并 prune（category 仍 OPEN）
  /** @type {string[]} */
  const excludeSourceMatchIds = [];
  const filtered = [];
  for (const category of inWindow) {
    if (!isPredictCategoryOpenForCollect(category)) {
      const sid = String(category.id ?? "").trim();
      if (sid)
        excludeSourceMatchIds.push(sid);
      continue;
    }
    filtered.push(category);
  }

  const marketIds = [];
  for (const category of filtered) {
    for (const market of category.markets ?? []) {
      if (market.id != null)
        marketIds.push(String(market.id));
    }
  }

  const books = await fetchPredictOrderbooks(marketIds);
  const buyPrices = {};
  for (const [id, book] of Object.entries(books)) {
    const ask = bestAskFromPredictBook(book);
    if (ask > 0 && ask < 1)
      buyPrices[id] = ask;
  }

  const candidates = [];
  for (const category of filtered) {
    const mapped = buildPredictMappedMarket(category, buyPrices, books);
    if (mapped)
      candidates.push(mapped);
    if (candidates.length >= MAX_TRACKED_MARKETS)
      break;
  }

  // 本轮写入的场绝不强删（与 PM 双保险同口径）
  const candidateSids = new Set(candidates.map(row => String(row.match.SourceMatchID)));
  const forceDeleteIds = excludeSourceMatchIds.filter(id => !candidateSids.has(String(id)));

  if (!candidates.length) {
    // 窗内无开放场：不整馆 clear；仅 prune 已结算/提案的 sid
    let pruned = 0;
    if (forceDeleteIds.length) {
      try {
        const deleted = await prunePredictFunPlatformMatches({ forceDeleteIds });
        pruned = Array.isArray(deleted) ? deleted.length : 0;
      }
      catch (err) {
        console.warn("[predictfun-collector] settle prune failed:", err?.message || err);
      }
    }
    console.warn(
      `[predictfun-collector] skip write: raw=${rawCategories.length} esport=${esportCategories.length} `
      + `inWindow=${inWindow.length} open=${filtered.length} mapped=0 exclude=${forceDeleteIds.length} pruned=${pruned}`,
    );
    return {
      matches: 0,
      bets: 0,
      mapBets: 0,
      raw: rawCategories.length,
      esport: esportCategories.length,
      inWindow: inWindow.length,
      open: filtered.length,
      excluded: forceDeleteIds.length,
      pruned,
      skippedClear: true,
    };
  }

  const matches = [...new Map(
    candidates.map(row => [String(row.match.SourceMatchID), row.match]),
  ).values()];
  const keepIds = matches.map(m => String(m.SourceMatchID));

  // matches 先落库；bets 按 source_bet_id upsert（map0 不抹 map1/2），再清本场多余 bet_id / 场级孤儿
  // 非 keep 的 PF 行会 orphan 删除；另显式 prune 结算 sid（双保险）
  await writePlatformMatchesAsync(PLATFORM, matches);

  let mapBetCount = 0;
  for (const mapped of candidates) {
    const list = Array.isArray(mapped.bets) && mapped.bets.length
      ? mapped.bets
      : [mapped.bet];
    const bets = list.map(bet => formatPredictionMarketBetOdds(bet));
    mapBetCount += bets.filter(b => Number(b?.Map) > 0).length;
    await syncPlatformBetsForMatchAsync(PLATFORM, mapped.match.SourceMatchID, bets);
  }
  await deleteOrphanPlatformBetsAsync(PLATFORM, keepIds);

  let settlePruned = 0;
  if (forceDeleteIds.length) {
    try {
      const deleted = await prunePredictFunPlatformMatches({ forceDeleteIds });
      settlePruned = Array.isArray(deleted) ? deleted.length : 0;
    }
    catch (err) {
      console.warn("[predictfun-collector] settle prune failed:", err?.message || err);
    }
  }

  // 开赛早于采集 past 窗（默认 6h）：全平台 prune
  let pastPruned = 0;
  try {
    const { pruneMatchesOlderThanCollectPast } = await import("@changmen/db");
    const past = await pruneMatchesOlderThanCollectPast();
    pastPruned = Number(past?.platform?.deleted) || 0;
    if (pastPruned || past?.client?.ended) {
      console.log(
        `[predictfun-collector] past prune platform=${pastPruned} clientEnded=${past?.client?.ended || 0}`,
      );
    }
  }
  catch (err) {
    console.warn("[predictfun-collector] past prune failed:", err?.message || err);
  }

  persistPredictFunMarketIndex(candidates, books);

  const betCount = candidates.reduce((n, mapped) => {
    const list = Array.isArray(mapped.bets) && mapped.bets.length
      ? mapped.bets
      : (mapped.bet ? [mapped.bet] : []);
    return n + list.length;
  }, 0);

  return {
    matches: matches.length,
    bets: betCount,
    mapBets: mapBetCount,
    raw: rawCategories.length,
    esport: esportCategories.length,
    inWindow: inWindow.length,
    open: filtered.length,
    excluded: forceDeleteIds.length,
    settlePruned,
  };
}
