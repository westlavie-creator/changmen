/**
 * Polymarket 电竞 discovery 一轮（官方对齐版）。
 *
 * - live（默认）：写 platform_* + MarketIndex；浏览器只消费 Index → WS → fo
 * - shadow：POLYMARKET_COLLECTOR_WRITE_PLATFORM=0 → 只写 MarketIndex
 *
 * 安全写库（live）：
 * - Gamma/网络抛错 → 上层 catch，本函数不写空库
 * - 有 typed ML 但解析全失败 → skipWrite，保留旧 RDS
 * - 窗口内无 ML → 才允许 clear（窗：live ∪ [now-6h, now+1h]）
 * - 软保留：开赛仍落在采集窗内、但本轮 Gamma 漏抓的场次：
 *   1) 从上一轮 Index（按 startTime）推出 retainIds（不依赖 DB 是否已被孤儿删）
 *   2) 把旧 Index 条目还原成 match+bet 并 upsert 进本轮写库
 *   3) alsoKeep 兜底（防 Index 缺 startTime 的旧部署）
 */

import {
  fetchPlatformMatches,
  replacePlatformBetsForMatch,
  replacePlatformBetsForMatchAsync,
  writePlatformMatches,
  writePlatformMatchesAsync,
} from "@changmen/db";
import { formatBetOdds } from "@changmen/shared/odds_format";
import { readPolymarketMarketIndex } from "@changmen/storage/polymarket_market_index.js";

import {
  fetchBatchBuyPrices,
  fetchPolymarketEsportsMarkets,
  normalizeSportsMarketType,
  POLYMARKET_COLLECT_FUTURE_MS,
  POLYMARKET_COLLECT_PAST_MS,
  polymarketCollectStartTimeAllowed,
  resolveCollectMarketTypes,
  takeWholeMatchesUpTo,
} from "./api.js";
import {
  persistPolymarketMarketIndex,
  rebuildPlatformRowsFromIndexEntries,
  resolveRetainIdsFromPreviousIndex,
} from "./market_index.js";
import {
  buildPolymarketMappedMarket,
  parseJsonArray,
} from "./parse.js";

const PLATFORM = "Polymarket";
const MAX_TRACKED_MARKETS = 400;

/** live 写库：默认 true；shadow 设 POLYMARKET_COLLECTOR_WRITE_PLATFORM=0 */
export function isPolymarketCollectorPlatformWriteEnabled() {
  const v = String(process.env.POLYMARKET_COLLECTOR_WRITE_PLATFORM ?? "1")
    .trim()
    .toLowerCase();
  return v !== "0" && v !== "false" && v !== "off" && v !== "no";
}

/**
 * 仍在采集时间窗内的既有 Polymarket 场次，本轮未采到时软保留（DB 兜底）。
 * @param {string[]} currentSourceMatchIds
 * @param {number} [nowMs]
 * @returns {Promise<string[]>}
 */
export async function resolvePolymarketSoftRetainSourceMatchIds(
  currentSourceMatchIds,
  nowMs = Date.now(),
) {
  const current = new Set((currentSourceMatchIds || []).map(String).filter(Boolean));
  const minStart = nowMs - POLYMARKET_COLLECT_PAST_MS;
  const maxStart = nowMs + POLYMARKET_COLLECT_FUTURE_MS;
  try {
    const byPlatform = await fetchPlatformMatches();
    const rows = Array.isArray(byPlatform?.[PLATFORM]) ? byPlatform[PLATFORM] : [];
    const retain = [];
    for (const row of rows) {
      const sid = String(row?.SourceMatchID || "").trim();
      if (!sid || current.has(sid))
        continue;
      const start = Number(row?.StartTime) || 0;
      if (start > 0 && start >= minStart && start <= maxStart)
        retain.push(sid);
    }
    return retain;
  }
  catch (err) {
    console.warn("[polymarket-esports] soft-retain lookup failed:", err.message);
    return [];
  }
}

/**
 * 合并 DB + 上一轮 Index 的软保留 ID。
 * @param {string[]} currentSourceMatchIds
 * @param {import("@changmen/api-contract").PolymarketMarketIndexEntry[]|null|undefined} previousEntries
 * @param {number} nowMs
 * @param {(provider?: string) => Promise<Record<string, object[]>>} fetchExistingMatches
 * @param {Set<string>} [excludeSourceMatchIds] 本轮 Gamma 已确认 ended/closed，禁止回填
 */
async function resolveSoftRetainIds(
  currentSourceMatchIds,
  previousEntries,
  nowMs,
  fetchExistingMatches,
  excludeSourceMatchIds = new Set(),
) {
  const current = new Set((currentSourceMatchIds || []).map(String).filter(Boolean));
  const exclude = excludeSourceMatchIds instanceof Set
    ? excludeSourceMatchIds
    : new Set((excludeSourceMatchIds || []).map(String).filter(Boolean));
  const fromIndex = resolveRetainIdsFromPreviousIndex(
    previousEntries,
    current,
    nowMs,
    POLYMARKET_COLLECT_PAST_MS,
    POLYMARKET_COLLECT_FUTURE_MS,
  );

  const fromDb = [];
  try {
    const byPlatform = await fetchExistingMatches();
    const rows = Array.isArray(byPlatform?.[PLATFORM]) ? byPlatform[PLATFORM] : [];
    const minStart = nowMs - POLYMARKET_COLLECT_PAST_MS;
    const maxStart = nowMs + POLYMARKET_COLLECT_FUTURE_MS;
    for (const row of rows) {
      const sid = String(row?.SourceMatchID || "").trim();
      if (!sid || current.has(sid) || exclude.has(sid))
        continue;
      const start = Number(row?.StartTime) || 0;
      if (start > 0 && start >= minStart && start <= maxStart)
        fromDb.push(sid);
    }
  }
  catch (err) {
    console.warn("[polymarket-esports] soft-retain resolve failed:", err.message);
  }

  return [...new Set([...fromIndex, ...fromDb])]
    .filter(sid => !exclude.has(String(sid)));
}

/**
 * @param {{
 *   fetchMarkets?: typeof fetchPolymarketEsportsMarkets,
 *   fetchPrices?: typeof fetchBatchBuyPrices,
 *   resolveTypes?: typeof resolveCollectMarketTypes,
 *   writeMatches?: typeof writePlatformMatches | typeof writePlatformMatchesAsync,
 *   replaceBets?: typeof replacePlatformBetsForMatch | typeof replacePlatformBetsForMatchAsync,
 *   persistIndex?: typeof persistPolymarketMarketIndex,
 *   fetchExistingMatches?: typeof fetchPlatformMatches,
 *   readPrevIndex?: typeof readPolymarketMarketIndex,
 *   writePlatform?: boolean,
 *   maxTracked?: number,
 *   nowMs?: number,
 * }} [deps]
 */
export async function runPolymarketEsportsDiscoveryCycle(deps = {}) {
  const fetchMarkets = deps.fetchMarkets ?? fetchPolymarketEsportsMarkets;
  const fetchPrices = deps.fetchPrices ?? fetchBatchBuyPrices;
  const resolveTypes = deps.resolveTypes ?? resolveCollectMarketTypes;
  // 默认 await 写库，避免 fire-and-forget 与下一轮软保留读库竞态
  const writeMatches = deps.writeMatches ?? writePlatformMatchesAsync;
  const replaceBets = deps.replaceBets ?? replacePlatformBetsForMatchAsync;
  const persistIndex = deps.persistIndex ?? persistPolymarketMarketIndex;
  const fetchExistingMatches = deps.fetchExistingMatches ?? fetchPlatformMatches;
  const readPrevIndex = deps.readPrevIndex ?? readPolymarketMarketIndex;
  const writePlatform = deps.writePlatform ?? isPolymarketCollectorPlatformWriteEnabled();
  const maxTracked = deps.maxTracked ?? MAX_TRACKED_MARKETS;
  const nowMs = deps.nowMs ?? Date.now();

  const collectTypes = await resolveTypes();
  const {
    markets: rawMarkets,
    rawEventCount,
    rawMarketCount,
    excludeSourceMatchIds: excludeSourceMatchIdsRaw,
  } = await fetchMarkets();
  const excludeSourceMatchIds = new Set(
    (excludeSourceMatchIdsRaw || []).map(String).filter(Boolean),
  );

  /** 类型门控后的 ML 候选（区分「无 ML」vs「有 ML 但解析失败」） */
  const typedMlRaw = [];
  for (const raw of rawMarkets) {
    const mtype = normalizeSportsMarketType(raw);
    if (!collectTypes.has(mtype))
      continue;
    const assetIds = parseJsonArray(raw.clob_token_ids ?? raw.clobTokenIds);
    if (assetIds.length !== 2)
      continue;
    typedMlRaw.push(raw);
  }

  const filtered = [];
  for (const raw of typedMlRaw) {
    const initial = buildPolymarketMappedMarket(raw);
    if (!initial)
      continue;
    if (!polymarketCollectStartTimeAllowed(initial.match.StartTime))
      continue;
    filtered.push(raw);
  }

  const allAssetIds = filtered.flatMap(raw =>
    parseJsonArray(raw.clob_token_ids ?? raw.clobTokenIds));
  const buyPrices = await fetchPrices(allAssetIds);

  /** @type {ReturnType<typeof buildPolymarketMappedMarket>[]} */
  const mappedAll = [];
  for (const raw of filtered) {
    const mapped = buildPolymarketMappedMarket(raw, buyPrices);
    if (mapped)
      mappedAll.push(mapped);
  }

  const candidates = takeWholeMatchesUpTo(
    mappedAll,
    row => String(row.match.SourceMatchID),
    maxTracked,
  );

  const prevIndex = readPrevIndex();
  const previousEntries = Array.isArray(prevIndex?.entries) ? prevIndex.entries : [];

  if (!candidates.length) {
    if (typedMlRaw.length > 0) {
      console.warn(
        `[polymarket-esports] skip write: typedMl=${typedMlRaw.length} filtered=0 `
        + `(rawMarkets=${rawMarketCount} events=${rawEventCount}); keep previous platform_*`,
      );
      return {
        matches: 0,
        bets: 0,
        skipped: true,
        reason: "filter_empty_with_typed_ml",
        writePlatform,
        rawMarketCount,
        rawEventCount,
        typedMlCount: typedMlRaw.length,
        collectTypes: [...collectTypes],
      };
    }

    // 窗内本应无 ML：仍尝试从 Index 软保留「刚开赛但 Gamma 整页空」的场次
    const softRetainIds = await resolveSoftRetainIds(
      [],
      previousEntries,
      nowMs,
      fetchExistingMatches,
      excludeSourceMatchIds,
    );
    const rebuilt = rebuildPlatformRowsFromIndexEntries(previousEntries, softRetainIds);
    if (softRetainIds.length && rebuilt.matches.length) {
      persistIndex([], buyPrices, {
        retainSourceMatchIds: softRetainIds,
        previousEntries,
        nowMs,
      });
      if (writePlatform) {
        await writeMatches(PLATFORM, rebuilt.matches, {
          alsoKeepSourceMatchIds: softRetainIds,
        });
        for (const [sid, bets] of rebuilt.betsByMatch)
          await replaceBets(PLATFORM, sid, bets.map(formatBetOdds));
      }
      return {
        matches: rebuilt.matches.length,
        bets: [...rebuilt.betsByMatch.values()].reduce((n, b) => n + b.length, 0),
        skipped: false,
        cleared: false,
        resurrected: true,
        shadow: !writePlatform,
        writePlatform,
        rawMarketCount,
        rawEventCount,
        typedMlCount: 0,
        collectTypes: [...collectTypes],
        softRetained: softRetainIds.length,
      };
    }

    // softRetainIds 有值但 Index 无法重建（仅 DB 有行）：不可 write([])，
    // 空数组会走 clear 快照、忽略 alsoKeep，反而把要保留的场次删光。
    if (softRetainIds.length) {
      console.warn(
        `[polymarket-esports] skip clear: softRetain=${softRetainIds.length} but index rebuild empty; keep previous platform_*`,
      );
      return {
        matches: 0,
        bets: 0,
        skipped: true,
        reason: "soft_retain_without_index",
        writePlatform,
        rawMarketCount,
        rawEventCount,
        typedMlCount: 0,
        collectTypes: [...collectTypes],
        softRetained: softRetainIds.length,
      };
    }

    persistIndex([]);
    if (writePlatform)
      await writeMatches(PLATFORM, []);
    return {
      matches: 0,
      bets: 0,
      skipped: false,
      cleared: writePlatform,
      shadow: !writePlatform,
      writePlatform,
      rawMarketCount,
      rawEventCount,
      typedMlCount: 0,
      collectTypes: [...collectTypes],
      softRetained: 0,
    };
  }

  const matchMap = new Map(
    candidates.map(row => [String(row.match.SourceMatchID), row.match]),
  );
  const betsByMatch = new Map();
  for (const mapped of candidates) {
    const sid = String(mapped.match.SourceMatchID);
    if (!betsByMatch.has(sid))
      betsByMatch.set(sid, []);
    betsByMatch.get(sid).push(formatBetOdds(mapped.bet));
  }

  const currentSids = [...matchMap.keys()];
  const softRetainIds = await resolveSoftRetainIds(
    currentSids,
    previousEntries,
    nowMs,
    fetchExistingMatches,
    excludeSourceMatchIds,
  );

  // Index 回填：漏抓场次完整 upsert（不只 alsoKeep 防删 —— 行已空时 alsoKeep 无效）
  if (softRetainIds.length) {
    const rebuilt = rebuildPlatformRowsFromIndexEntries(previousEntries, softRetainIds);
    for (const m of rebuilt.matches) {
      const sid = String(m.SourceMatchID);
      if (!matchMap.has(sid))
        matchMap.set(sid, m);
    }
    for (const [sid, bets] of rebuilt.betsByMatch) {
      if (!betsByMatch.has(sid))
        betsByMatch.set(sid, bets.map(formatBetOdds));
    }
  }

  const matches = [...matchMap.values()];

  persistIndex(candidates, buyPrices, {
    retainSourceMatchIds: softRetainIds,
    previousEntries,
    nowMs,
  });

  if (writePlatform) {
    await writeMatches(PLATFORM, matches, { alsoKeepSourceMatchIds: softRetainIds });
    for (const [sid, bets] of betsByMatch)
      await replaceBets(PLATFORM, sid, bets);
  }

  return {
    matches: matches.length,
    bets: [...betsByMatch.values()].reduce((n, b) => n + b.length, 0),
    skipped: false,
    shadow: !writePlatform,
    writePlatform,
    rawMarketCount,
    rawEventCount,
    collectTypes: [...collectTypes],
    truncated: mappedAll.length > candidates.length,
    softRetained: softRetainIds.length,
  };
}

