import { getPlatformGameId } from "./game_catalog.js";
import catalog from "./market_catalog.json" with { type: "json" };

const patternCache = new Map<string, RegExp>();

function cleanText(v: unknown): string {
  return String(v ?? "").trim();
}

function compilePattern(source: string): RegExp | null {
  if (!source)
    return null;
  if (!patternCache.has(source)) {
    patternCache.set(source, new RegExp(source));
  }
  return patternCache.get(source)!;
}

function listMarkets(): Record<string, unknown>[] {
  return (catalog.markets as Record<string, unknown>[]).slice();
}

function getAggregatedMarkets(): Record<string, unknown>[] {
  return (catalog.markets as Record<string, unknown>[]).filter(m => m.aggregated);
}

function getMarketByCode(code: string): Record<string, unknown> | null {
  return (catalog.markets as Record<string, unknown>[]).find(m => m.code === code) || null;
}

function getDefaultMarketCode(): string {
  return (getAggregatedMarkets()[0]?.code as string) || "match_winner";
}

function getPlatformRules(platform: string, marketCode?: string): Record<string, unknown> | null {
  const market = getMarketByCode(marketCode || getDefaultMarketCode());
  const platforms = market?.platforms as Record<string, Record<string, unknown>> | undefined;
  return platforms?.[platform] || null;
}

function getCatalogSummary(): Record<string, unknown> {
  return {
    version: catalog.version,
    updatedAt: catalog.updatedAt,
    judgmentModel: (catalog as Record<string, unknown>).judgmentModel,
    aggregatedCodes: getAggregatedMarkets().map(m => m.code),
    markets: (catalog.markets as Record<string, unknown>[]).map(m => ({
      code: m.code,
      name: m.name,
      aggregated: Boolean(m.aggregated),
      platforms: Object.fromEntries(
        Object.entries((m.platforms as Record<string, Record<string, unknown>>) || {}).map(([id, rules]) => [
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

function fieldValue(obj: Record<string, unknown> | null | undefined, field: string): unknown {
  if (!obj || !field)
    return undefined;
  return obj[field];
}

function passesExcludeIf(obj: Record<string, unknown> | null | undefined, excludeIf: Array<{ field: string; eq: unknown }> | undefined): boolean {
  for (const rule of excludeIf || []) {
    if (fieldValue(obj, rule.field) === rule.eq)
      return false;
  }
  return true;
}

function obBuildBetKey(raw: Record<string, unknown> | null | undefined, rules: Record<string, unknown>): string {
  const round = Number(raw?.round ?? 0);
  const roundLabelMap = rules.roundLabel as Record<string, string> | undefined;
  const roundLabel
    = round === 0
      ? roundLabelMap?.["0"] || "全场"
      : (roundLabelMap?.n || "地图{n}").replace(/\{n\}/g, String(round));
  const cnField = (rules.cnNameField as string) || "cn_name";
  const cn = cleanText(raw?.[cnField]).replace(/&nbsp;/g, "");
  return `[${roundLabel}]-${cn}`;
}

function obExpectedOddTypeId(rules: Record<string, unknown> | null, gameCode: string, round: number): string | null {
  const gameOddTypes = rules?.gameOddTypes as Record<string, Record<string, unknown>> | undefined;
  const gameMap = gameOddTypes?.[gameCode];
  if (!gameMap)
    return null;
  const r = Number(round ?? 0);
  return r === 0 ? (gameMap.full as string) : (gameMap.map as string);
}

/** OB 采集端 gameOddTypes：catalog gameCode → 平台 game_id 索引 */
function getObGameOddTypesByPlatformGameId(): Record<string, { full: string; map: string }> {
  const rules = getPlatformRules("OB", getDefaultMarketCode());
  const gameOddTypes = rules?.gameOddTypes as Record<string, Record<string, unknown>> | undefined;
  if (!gameOddTypes)
    return {};
  const out: Record<string, { full: string; map: string }> = {};
  for (const [gameCode, spec] of Object.entries(gameOddTypes)) {
    const platformId = getPlatformGameId("OB", gameCode);
    if (!platformId || spec?.full == null || spec?.map == null)
      continue;
    out[platformId] = { full: String(spec.full), map: String(spec.map) };
  }
  return out;
}

function obMatchesOddTypeId(raw: Record<string, unknown>, rules: Record<string, unknown> | null, gameCode: string, round: number): boolean | null {
  const expected = obExpectedOddTypeId(rules, gameCode, round);
  if (expected == null)
    return null;
  const field = (rules?.oddTypeIdField as string) || "odd_type_id";
  return String(raw?.[field] ?? "") === String(expected);
}

function obMatchesMarket(raw: Record<string, unknown>, rules: Record<string, unknown>, ctx: Record<string, unknown>): boolean {
  if (!ctx.gameCode)
    return false;
  const round = (ctx.round ?? raw?.round ?? (ctx.market as Record<string, unknown> | undefined)?.round ?? 0) as number;
  return obMatchesOddTypeId(raw, rules, ctx.gameCode as string, round) === true;
}
function buildTestSubject(_platform: string, rules: Record<string, unknown>, ctx: Record<string, unknown>): string {
  const row = ctx.row as Record<string, unknown> | undefined;
  const market = ctx.market as Record<string, unknown> | undefined;
  switch (rules.testOn) {
    case "betKey":
      return obBuildBetKey((ctx.raw || market?.raw || market) as Record<string, unknown> | undefined, rules);
    case "group_name":
      return cleanText(row?.group_name ?? ctx.group_name);
    case "market_name":
      return cleanText(row?.market_name ?? ctx.market_name);
    default:
      return cleanText(ctx.subject);
  }
}

function passesRequirements(platform: string, rules: Record<string, unknown>, ctx: Record<string, unknown>): boolean {
  if (!passesExcludeIf((ctx.raw || ctx.row || ctx.market) as Record<string, unknown> | undefined, rules.excludeIf as Array<{ field: string; eq: unknown }> | undefined)) {
    return false;
  }

  const subject = buildTestSubject(platform, rules, ctx);
  for (const bad of (rules.betKeyExcludeContains as string[]) || []) {
    if (subject.includes(bad))
      return false;
  }

  if (platform === "OB" && (rules.requireOddsNames as string[] | undefined)?.length) {
    const market = ctx.market as Record<string, unknown> | undefined;
    const odds = (market?.odds || []) as Array<Record<string, unknown>>;
    const names = new Set(odds.map(o => o.name || (o.raw as Record<string, unknown> | undefined)?.name));
    for (const need of rules.requireOddsNames as string[]) {
      if (!names.has(need))
        return false;
    }
  }

  return true;
}

/**
 * 判定 raw/row/market 是否属于指定 market.code
 */
function matchesMarketCode(platform: string, marketCode: string, ctx: Record<string, unknown>): boolean {
  const rules = getPlatformRules(platform, marketCode);
  if (!rules)
    return false;

  const market = ctx.market as Record<string, unknown> | undefined;
  const raw = (ctx.raw || market?.raw || market) as Record<string, unknown>;

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
  const re = compilePattern(rules.betName as string);
  if (!re?.test(subject))
    return false;

  return passesRequirements(platform, rules, ctx);
}

function resolveMarketCode(platform: string, ctx: Record<string, unknown>): string | null {
  for (const market of getAggregatedMarkets()) {
    if (matchesMarketCode(platform, market.code as string, ctx)) {
      return market.code as string;
    }
  }
  return null;
}

function obPickWinMarket(markets: Record<string, unknown>[], round: number = 0, marketCode?: string, gameCode?: string): Record<string, unknown> | null {
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

function obFormatNormalizedMarketName(round: number, cnName: string): string {
  const rules = getPlatformRules("OB");
  return obBuildBetKey({ round, cn_name: cnName }, rules || { roundLabel: { 0: "全场", n: "地图{n}" }, cnNameField: "cn_name" });
}

function rayIsAggregatedOddsRow(row: Record<string, unknown>, marketCode?: string): boolean {
  return matchesMarketCode("RAY", marketCode || getDefaultMarketCode(), { row });
}

function obSavedBetIsMatchWinner(bet: Record<string, unknown>, gameCode: string | null): boolean {
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
  for (const bad of (rules.betKeyExcludeContains as string[]) || []) {
    if (name.includes(bad))
      return false;
  }
  return obMatchesOddTypeId({ odd_type_id }, rules, gameCode, round) === true;
}

/** SaveBet 无 odd_type_id 时：排除 CS2 等地图子盘（手枪局/回合），保留单局/全局主盘 */
function obLegacyWinBetName(betName: string): boolean {
  const name = cleanText(betName);
  if (!name || name.includes("+"))
    return false;
  const rules = getPlatformRules("OB", getDefaultMarketCode());
  if (!rules?.betName)
    return false;
  for (const bad of (rules.betKeyExcludeContains as string[]) || []) {
    if (name.includes(bad))
      return false;
  }
  if (/手枪局/.test(name))
    return false;
  if (/第\d+回合/.test(name))
    return false;
  if (!compilePattern(rules.betName as string)!.test(name))
    return false;
  if (/^\[地图\d+\]-/.test(name) && !name.includes("单局") && !name.includes("全局"))
    return false;
  return true;
}

/** A8 SaveBet：RAY 将源站 group_name 编入 BetName（如 [全场] 获胜者） */
function rayLegacyWinBetName(betName: string): boolean {
  return (
    /^(全场胜负|全场)$/.test(betName)
    || /^地图\d+$/.test(betName)
    || /^(\[全场\]|\[地图\d+\])\s*获胜者$/.test(betName)
  );
}

/** RAY match_winner：认 SaveBet BetName（A8 无独立 GroupName 字段） */
function raySavedBetIsMatchWinner(bet: Record<string, unknown>): boolean {
  const rules = getPlatformRules("RAY", getDefaultMarketCode());
  const betName = cleanText(bet?.BetName ?? bet?.Name);
  if (!betName || !rayLegacyWinBetName(betName))
    return false;
  for (const bad of (rules?.betKeyExcludeContains as string[]) || []) {
    if (betName.includes(bad))
      return false;
  }
  return true;
}

/** IA match_winner：地图主盘为 [地图N] 获胜者；排除手枪局/回合等子盘 */
function iaLegacyWinBetName(betName: string): boolean {
  const name = cleanText(betName);
  if (!name || name.includes("+"))
    return false;
  const rules = getPlatformRules("IA", getDefaultMarketCode());
  for (const bad of (rules?.betKeyExcludeContains as string[]) || []) {
    if (name.includes(bad))
      return false;
  }
  if (/手枪局/.test(name))
    return false;
  if (/回合/.test(name))
    return false;
  return /^(\[全场\].+获胜)$|^(\[地图\d+\]\s*获胜者)$/.test(name);
}

function iaSavedBetIsMatchWinner(bet: Record<string, unknown>): boolean {
  const betName = cleanText(bet?.BetName ?? bet?.Name);
  if (!betName || !iaLegacyWinBetName(betName))
    return false;
  return true;
}

/**
 * Filter stored API_SaveBet rows for Client_GetMatchs (A8 仅展示 match_winner 主盘).
 * OB：odd_type_id + gameCode；RAY：BetName 形态（与 A8 saveBets 一致）。
 */
function matchesSavedBet(platform: string, bet: Record<string, unknown> | null | undefined, ctx: Record<string, unknown> = {}): boolean {
  if (!bet)
    return false;
  const code = getDefaultMarketCode();
  const rules = getPlatformRules(platform, code);
  if (!rules)
    return false;

  if (platform === "OB") {
    return obSavedBetIsMatchWinner(bet, (ctx.gameCode as string) ?? null);
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
  for (const bad of (rules.betKeyExcludeContains as string[]) || []) {
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
