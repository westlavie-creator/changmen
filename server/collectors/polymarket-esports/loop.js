/**
 * Polymarket 电竞 discovery 一轮（官方对齐版）。
 *
 * - live（默认）：写 platform_* + MarketIndex；浏览器只消费 Index → WS → fo
 * - shadow：POLYMARKET_COLLECTOR_WRITE_PLATFORM=0 → 只写 MarketIndex
 *
 * 安全写库（live）：
 * - Gamma/网络抛错 → 上层 catch，本函数不写空库
 * - 有 typed ML 但解析全失败 → skipWrite，保留旧 RDS
 * - 窗口内无 ML → 才允许 clear（窗：live ∪ 未来 1h）
 */

import { replacePlatformBetsForMatch, writePlatformMatches } from "@changmen/db";
import { formatBetOdds } from "@changmen/shared/odds_format";

import {
  fetchBatchBuyPrices,
  fetchPolymarketEsportsMarkets,
  normalizeSportsMarketType,
  polymarketCollectStartTimeAllowed,
  resolveCollectMarketTypes,
  takeWholeMatchesUpTo,
} from "./api.js";
import { persistPolymarketMarketIndex } from "./market_index.js";
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
 * @param {{
 *   fetchMarkets?: typeof fetchPolymarketEsportsMarkets,
 *   fetchPrices?: typeof fetchBatchBuyPrices,
 *   resolveTypes?: typeof resolveCollectMarketTypes,
 *   writeMatches?: typeof writePlatformMatches,
 *   replaceBets?: typeof replacePlatformBetsForMatch,
 *   persistIndex?: typeof persistPolymarketMarketIndex,
 *   writePlatform?: boolean,
 *   maxTracked?: number,
 * }} [deps]
 */
export async function runPolymarketEsportsDiscoveryCycle(deps = {}) {
  const fetchMarkets = deps.fetchMarkets ?? fetchPolymarketEsportsMarkets;
  const fetchPrices = deps.fetchPrices ?? fetchBatchBuyPrices;
  const resolveTypes = deps.resolveTypes ?? resolveCollectMarketTypes;
  const writeMatches = deps.writeMatches ?? writePlatformMatches;
  const replaceBets = deps.replaceBets ?? replacePlatformBetsForMatch;
  const persistIndex = deps.persistIndex ?? persistPolymarketMarketIndex;
  const writePlatform = deps.writePlatform ?? isPolymarketCollectorPlatformWriteEnabled();
  const maxTracked = deps.maxTracked ?? MAX_TRACKED_MARKETS;

  const collectTypes = await resolveTypes();
  const { markets: rawMarkets, rawEventCount, rawMarketCount } = await fetchMarkets();

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
    persistIndex([]);
    if (writePlatform)
      writeMatches(PLATFORM, []);
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
    };
  }

  const matches = [...new Map(
    candidates.map(row => [String(row.match.SourceMatchID), row.match]),
  ).values()];

  const betsByMatch = new Map();
  for (const mapped of candidates) {
    const sid = String(mapped.match.SourceMatchID);
    if (!betsByMatch.has(sid))
      betsByMatch.set(sid, []);
    betsByMatch.get(sid).push(formatBetOdds(mapped.bet));
  }

  persistIndex(candidates, buyPrices);

  if (writePlatform) {
    writeMatches(PLATFORM, matches);
    for (const [sid, bets] of betsByMatch)
      replaceBets(PLATFORM, sid, bets);
  }

  return {
    matches: matches.length,
    bets: candidates.length,
    skipped: false,
    shadow: !writePlatform,
    writePlatform,
    rawMarketCount,
    rawEventCount,
    collectTypes: [...collectTypes],
    truncated: mappedAll.length > candidates.length,
  };
}
