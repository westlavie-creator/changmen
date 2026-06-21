import { getPlatformGameId } from "./game_catalog.mjs";
import catalog from "./market_catalog.json" with { type: "json" };

const patternCache = new Map();

function cleanText(v) {
  return String(v ?? "").trim();
}

function compilePattern(source) {
  if (!source)
    return null;
  if (!patternCache.has(source)) {
    patternCache.set(source, new RegExp(source));
  }
  return patternCache.get(source);
}

function listMarkets() {
  return catalog.markets.slice();
}

function getAggregatedMarkets() {
  return catalog.markets.filter(m => m.aggregated);
}

function getMarketByCode(code) {
  return catalog.markets.find(m => m.code === code) || null;
}

function getDefaultMarketCode() {
  return getAggregatedMarkets()[0]?.code || "match_winner";
}

function getPlatformRules(platform, marketCode) {
  const market = getMarketByCode(marketCode || getDefaultMarketCode());
  return market?.platforms?.[platform] || null;
}

function getCatalogSummary() {
  return {
    version: catalog.version,
    updatedAt: catalog.updatedAt,
    judgmentModel: catalog.judgmentModel,
    aggregatedCodes: getAggregatedMarkets().map(m => m.code),
    markets: catalog.markets.map(m => ({
      code: m.code,
      name: m.name,
      aggregated: Boolean(m.aggregated),
      platforms: Object.fromEntries(
        Object.entries(m.platforms || {}).map(([id, rules]) => [
          id,
          {
            primaryMatch: rules.primaryMatch,
            gameOddTypes: rules.gameOddTypes,
            betName: rules.betName,
            testOn: rules.testOn,
          },
        ]),
      ),
    })),
  };
}

function fieldValue(obj, field) {
  if (!obj || !field)
    return undefined;
  return obj[field];
}

function passesExcludeIf(obj, excludeIf) {
  for (const rule of excludeIf || []) {
    if (fieldValue(obj, rule.field) === rule.eq)
      return false;
  }
  return true;
}

function obBuildBetKey(raw, rules) {
  const round = Number(raw?.round ?? 0);
  const roundLabel
    = round === 0
      ? rules.roundLabel?.["0"] || "全场"
      : (rules.roundLabel?.n || "地图{n}").replace(/\{n\}/g, String(round));
  const cnField = rules.cnNameField || "cn_name";
  const cn = cleanText(raw?.[cnField]).replace(/&nbsp;/g, "");
  return `[${roundLabel}]-${cn}`;
}

function obExpectedOddTypeId(rules, gameCode, round) {
  const gameMap = rules?.gameOddTypes?.[gameCode];
  if (!gameMap)
    return null;
  const r = Number(round ?? 0);
  return r === 0 ? gameMap.full : gameMap.map;
}

/** OB 采集端 gameOddTypes：catalog gameCode → 平台 game_id 索引 */
function getObGameOddTypesByPlatformGameId() {
  const rules = getPlatformRules("OB", getDefaultMarketCode());
  if (!rules?.gameOddTypes)
    return {};
  const out = {};
  for (const [gameCode, spec] of Object.entries(rules.gameOddTypes)) {
    const platformId = getPlatformGameId("OB", gameCode);
    if (!platformId || spec?.full == null || spec?.map == null)
      continue;
    out[platformId] = { full: String(spec.full), map: String(spec.map) };
  }
  return out;
}

function obMatchesOddTypeId(raw, rules, gameCode, round) {
  const expected = obExpectedOddTypeId(rules, gameCode, round);
  if (expected == null)
    return null;
  const field = rules.oddTypeIdField || "odd_type_id";
  return String(raw?.[field] ?? "") === String(expected);
}

function obMatchesBetName(raw, rules, ctx) {
  if (!rules?.betName)
    return false;
  const subject = buildTestSubject("OB", rules, ctx);
  if (!subject)
    return false;
  const re = compilePattern(rules.betName);
  return Boolean(re?.test(subject));
}

function obMatchesMarket(raw, rules, ctx) {
  if (!ctx.gameCode)
    return false;
  const round = ctx.round ?? raw?.round ?? ctx.market?.round ?? 0;
  return obMatchesOddTypeId(raw, rules, ctx.gameCode, round) === true;
}
function buildTestSubject(platform, rules, ctx) {
  switch (rules.testOn) {
    case "betKey":
      return obBuildBetKey(ctx.raw || ctx.market?.raw || ctx.market, rules);
    case "group_name":
      return cleanText(ctx.row?.group_name ?? ctx.group_name);
    case "market_name":
      return cleanText(ctx.row?.market_name ?? ctx.market_name);
    default:
      return cleanText(ctx.subject);
  }
}

function passesRequirements(platform, rules, ctx) {
  if (!passesExcludeIf(ctx.raw || ctx.row || ctx.market, rules.excludeIf)) {
    return false;
  }

  const subject = buildTestSubject(platform, rules, ctx);
  for (const bad of rules.betKeyExcludeContains || []) {
    if (subject.includes(bad))
      return false;
  }

  if (platform === "OB" && rules.requireOddsNames?.length) {
    const odds = ctx.market?.odds || [];
    const names = new Set(odds.map(o => o.name || o.raw?.name));
    for (const need of rules.requireOddsNames) {
      if (!names.has(need))
        return false;
    }
  }

  return true;
}

/**
 * 判定 raw/row/market 是否属于指定 market.code
 */
function matchesMarketCode(platform, marketCode, ctx) {
  const rules = getPlatformRules(platform, marketCode);
  if (!rules)
    return false;

  const raw = ctx.raw || ctx.market?.raw || ctx.market;

  if (platform === "OB") {
    if (!obMatchesMarket(raw, rules, ctx))
      return false;
    return passesRequirements(platform, rules, ctx);
  }

  if (!rules.betName)
    return false;
  const subject = buildTestSubject(platform, rules, ctx);
  if (!subject)
    return false;
  const re = compilePattern(rules.betName);
  if (!re?.test(subject))
    return false;

  return passesRequirements(platform, rules, ctx);
}

function resolveMarketCode(platform, ctx) {
  for (const market of getAggregatedMarkets()) {
    if (matchesMarketCode(platform, market.code, ctx)) {
      return market.code;
    }
  }
  return null;
}

function obPickWinMarket(markets, round = 0, marketCode, gameCode) {
  const code = marketCode || getDefaultMarketCode();
  return (
    markets.find((mk) => {
      if (mk.round !== round)
        return false;
      return matchesMarketCode("OB", code, {
        market: mk,
        raw: mk.raw,
        round,
        gameCode,
      });
    }) || null
  );
}

function obFormatNormalizedMarketName(round, cnName) {
  const rules = getPlatformRules("OB");
  return obBuildBetKey({ round, cn_name: cnName }, rules || { roundLabel: { 0: "全场", n: "地图{n}" }, cnNameField: "cn_name" });
}

function rayIsAggregatedOddsRow(row, marketCode) {
  return matchesMarketCode("RAY", marketCode || getDefaultMarketCode(), { row });
}

function obSavedBetIsMatchWinner(bet, gameCode) {
  if (!gameCode)
    return false;
  const rules = getPlatformRules("OB", getDefaultMarketCode());
  if (!rules)
    return false;
  const odd_type_id = cleanText(bet?.OddTypeID ?? bet?.odd_type_id ?? bet?.OddTypeId);
  if (!odd_type_id)
    return false;
  const round = Number(bet?.Map ?? 0);
  const name = cleanText(bet?.BetName ?? bet?.Name);
  for (const bad of rules.betKeyExcludeContains || []) {
    if (name.includes(bad))
      return false;
  }
  return obMatchesOddTypeId({ odd_type_id }, rules, gameCode, round) === true;
}

/** SaveBet 无 odd_type_id 时：排除 CS2 等地图子盘（手枪局/回合），保留单局/全局主盘 */
function obLegacyWinBetName(betName) {
  const name = cleanText(betName);
  if (!name || name.includes("+"))
    return false;
  const rules = getPlatformRules("OB", getDefaultMarketCode());
  if (!rules?.betName)
    return false;
  for (const bad of rules.betKeyExcludeContains || []) {
    if (name.includes(bad))
      return false;
  }
  if (/手枪局/.test(name))
    return false;
  if (/第\d+回合/.test(name))
    return false;
  if (!compilePattern(rules.betName).test(name))
    return false;
  if (/^\[地图\d+\]-/.test(name) && !name.includes("单局") && !name.includes("全局"))
    return false;
  return true;
}

/** A8 SaveBet：RAY 将源站 group_name 编入 BetName（如 [全场] 获胜者） */
function rayLegacyWinBetName(betName) {
  return (
    /^(全场胜负|全场)$/.test(betName)
    || /^地图\d+$/.test(betName)
    || /^(\[全场\]|\[地图\d+\])\s*获胜者$/.test(betName)
  );
}

/** RAY match_winner：认 SaveBet BetName（A8 无独立 GroupName 字段） */
function raySavedBetIsMatchWinner(bet) {
  const rules = getPlatformRules("RAY", getDefaultMarketCode());
  const betName = cleanText(bet?.BetName ?? bet?.Name);
  if (!betName || !rayLegacyWinBetName(betName))
    return false;
  for (const bad of rules?.betKeyExcludeContains || []) {
    if (betName.includes(bad))
      return false;
  }
  return true;
}

/** IA match_winner：地图主盘为 [地图N] 获胜者；排除手枪局/回合等子盘 */
function iaLegacyWinBetName(betName) {
  const name = cleanText(betName);
  if (!name || name.includes("+"))
    return false;
  const rules = getPlatformRules("IA", getDefaultMarketCode());
  for (const bad of rules?.betKeyExcludeContains || []) {
    if (name.includes(bad))
      return false;
  }
  if (/手枪局/.test(name))
    return false;
  if (/回合/.test(name))
    return false;
  return /^(\[全场\].+获胜)$|^(\[地图\d+\]\s*获胜者)$/.test(name);
}

function iaSavedBetIsMatchWinner(bet) {
  const betName = cleanText(bet?.BetName ?? bet?.Name);
  if (!betName || !iaLegacyWinBetName(betName))
    return false;
  return true;
}

/**
 * Filter stored API_SaveBet rows for Client_GetMatchs (A8 仅展示 match_winner 主盘).
 * OB：odd_type_id + gameCode；RAY：BetName 形态（与 A8 saveBets 一致）。
 */
function matchesSavedBet(platform, bet, ctx = {}) {
  if (!bet)
    return false;
  const code = getDefaultMarketCode();
  const rules = getPlatformRules(platform, code);
  if (!rules)
    return false;

  if (platform === "OB") {
    return obSavedBetIsMatchWinner(bet, ctx.gameCode ?? null);
  }
  if (platform === "RAY") {
    return raySavedBetIsMatchWinner(bet);
  }
  if (platform === "IA") {
    return iaSavedBetIsMatchWinner(bet);
  }

  const name = cleanText(bet?.BetName ?? bet?.Name);
  if (!name)
    return false;
  for (const bad of rules.betKeyExcludeContains || []) {
    if (name.includes(bad))
      return false;
  }
  return matchesMarketCode(platform, code, {
    subject: name,
    row: bet,
    market_name: name,
    betKey: name,
  });
}

export {
  buildTestSubject,
  catalog,
  getAggregatedMarkets,
  getCatalogSummary,
  getDefaultMarketCode,
  getMarketByCode,
  getObGameOddTypesByPlatformGameId,
  getPlatformRules,
  iaLegacyWinBetName,
  iaSavedBetIsMatchWinner,
  listMarkets,
  matchesMarketCode,
  matchesSavedBet,
  obBuildBetKey,
  obExpectedOddTypeId,
  obFormatNormalizedMarketName,
  obLegacyWinBetName,
  obMatchesOddTypeId,
  obPickWinMarket,
  obSavedBetIsMatchWinner,
  rayIsAggregatedOddsRow,
  rayLegacyWinBetName,
  raySavedBetIsMatchWinner,
  resolveMarketCode,
};
