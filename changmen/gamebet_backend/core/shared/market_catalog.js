"use strict";

const catalog = require("./market_catalog.json");

const patternCache = new Map();

function cleanText(v) {
  return String(v ?? "").trim();
}

function compilePattern(source) {
  if (!source) return null;
  if (!patternCache.has(source)) {
    patternCache.set(source, new RegExp(source));
  }
  return patternCache.get(source);
}

function listMarkets() {
  return catalog.markets.slice();
}

function getAggregatedMarkets() {
  return catalog.markets.filter((m) => m.aggregated);
}

function getMarketByCode(code) {
  return catalog.markets.find((m) => m.code === code) || null;
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
    aggregatedCodes: getAggregatedMarkets().map((m) => m.code),
    markets: catalog.markets.map((m) => ({
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
        ])
      ),
    })),
  };
}

function fieldValue(obj, field) {
  if (!obj || !field) return undefined;
  return obj[field];
}

function passesExcludeIf(obj, excludeIf) {
  for (const rule of excludeIf || []) {
    if (fieldValue(obj, rule.field) === rule.eq) return false;
  }
  return true;
}

function obBuildBetKey(raw, rules) {
  const round = Number(raw?.round ?? 0);
  const roundLabel =
    round === 0
      ? rules.roundLabel?.["0"] || "全场"
      : (rules.roundLabel?.n || "地图{n}").replace(/\{n\}/g, String(round));
  const cnField = rules.cnNameField || "cn_name";
  const cn = cleanText(raw?.[cnField]).replace(/&nbsp;/g, "");
  return `[${roundLabel}]-${cn}`;
}

function obExpectedOddTypeId(rules, gameCode, round) {
  const gameMap = rules?.gameOddTypes?.[gameCode];
  if (!gameMap) return null;
  const r = Number(round ?? 0);
  return r === 0 ? gameMap.full : gameMap.map;
}

/** OB 采集端 gameOddTypes：catalog gameCode → 平台 game_id 索引 */
function getObGameOddTypesByPlatformGameId() {
  const rules = getPlatformRules("OB", getDefaultMarketCode());
  if (!rules?.gameOddTypes) return {};
  const { getPlatformGameId } = require("./game_catalog");
  const out = {};
  for (const [gameCode, spec] of Object.entries(rules.gameOddTypes)) {
    const platformId = getPlatformGameId("OB", gameCode);
    if (!platformId || spec?.full == null || spec?.map == null) continue;
    out[platformId] = { full: String(spec.full), map: String(spec.map) };
  }
  return out;
}

function obMatchesOddTypeId(raw, rules, gameCode, round) {
  const expected = obExpectedOddTypeId(rules, gameCode, round);
  if (expected == null) return null;
  const field = rules.oddTypeIdField || "odd_type_id";
  return String(raw?.[field] ?? "") === String(expected);
}

function obMatchesBetName(raw, rules, ctx) {
  if (!rules?.betName) return false;
  const subject = buildTestSubject("OB", rules, ctx);
  if (!subject) return false;
  const re = compilePattern(rules.betName);
  return Boolean(re?.test(subject));
}

function obMatchesMarket(raw, rules, ctx) {
  if (!ctx.gameCode) return false;
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
    if (subject.includes(bad)) return false;
  }

  if (platform === "OB" && rules.requireOddsNames?.length) {
    const odds = ctx.market?.odds || [];
    const names = new Set(odds.map((o) => o.name || o.raw?.name));
    for (const need of rules.requireOddsNames) {
      if (!names.has(need)) return false;
    }
  }

  return true;
}

/**
 * 判定 raw/row/market 是否属于指定 market.code
 */
function matchesMarketCode(platform, marketCode, ctx) {
  const rules = getPlatformRules(platform, marketCode);
  if (!rules) return false;

  const raw = ctx.raw || ctx.market?.raw || ctx.market;

  if (platform === "OB") {
    if (!obMatchesMarket(raw, rules, ctx)) return false;
    return passesRequirements(platform, rules, ctx);
  }

  if (!rules.betName) return false;
  const subject = buildTestSubject(platform, rules, ctx);
  if (!subject) return false;
  const re = compilePattern(rules.betName);
  if (!re?.test(subject)) return false;

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
      if (mk.round !== round) return false;
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
  if (!gameCode) return false;
  const rules = getPlatformRules("OB", getDefaultMarketCode());
  if (!rules) return false;
  const odd_type_id = cleanText(bet?.OddTypeID ?? bet?.odd_type_id ?? bet?.OddTypeId);
  if (!odd_type_id) return false;
  const round = Number(bet?.Map ?? 0);
  const name = cleanText(bet?.BetName ?? bet?.Name);
  for (const bad of rules.betKeyExcludeContains || []) {
    if (name.includes(bad)) return false;
  }
  return obMatchesOddTypeId({ odd_type_id }, rules, gameCode, round) === true;
}

/** RAY match_winner：仅认落库的 GroupName / group_name（源站 group_name 字段） */
function raySavedBetIsMatchWinner(bet) {
  const group_name = cleanText(bet?.GroupName ?? bet?.group_name);
  if (!group_name) return false;
  const rules = getPlatformRules("RAY", getDefaultMarketCode());
  if (!rules?.betName) return false;
  const re = compilePattern(rules.betName);
  if (!re?.test(group_name)) return false;
  for (const bad of rules.betKeyExcludeContains || []) {
    if (group_name.includes(bad)) return false;
  }
  return true;
}

/**
 * Filter stored API_SaveBet rows for Client_GetMatchs (A8 仅展示 match_winner 主盘).
 * OB：odd_type_id + gameCode；RAY：GroupName；禁止 cn_name / BetName 回退。
 */
function matchesSavedBet(platform, bet, ctx = {}) {
  if (!bet) return false;
  const code = getDefaultMarketCode();
  const rules = getPlatformRules(platform, code);
  if (!rules) return false;

  if (platform === "OB") {
    return obSavedBetIsMatchWinner(bet, ctx.gameCode ?? null);
  }
  if (platform === "RAY") {
    return raySavedBetIsMatchWinner(bet);
  }

  const name = cleanText(bet?.BetName ?? bet?.Name);
  if (!name) return false;
  for (const bad of rules.betKeyExcludeContains || []) {
    if (name.includes(bad)) return false;
  }
  return matchesMarketCode(platform, code, {
    subject: name,
    row: bet,
    market_name: name,
    betKey: name,
  });
}

module.exports = {
  catalog,
  listMarkets,
  getAggregatedMarkets,
  getMarketByCode,
  getDefaultMarketCode,
  getPlatformRules,
  getCatalogSummary,
  obBuildBetKey,
  buildTestSubject,
  matchesMarketCode,
  resolveMarketCode,
  obPickWinMarket,
  getObGameOddTypesByPlatformGameId,
  obFormatNormalizedMarketName,
  rayIsAggregatedOddsRow,
  obSavedBetIsMatchWinner,
  raySavedBetIsMatchWinner,
  matchesSavedBet,
};
