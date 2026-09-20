import type { PodBoardFixture, PodFixtureMatch } from "@/runtime/podFixtureMatch";
import type { PodMarketMatch, PodMarketSide } from "@/runtime/podMarketMatch";

export type FootballFollowPeriod = "full" | "half";
export type FootballFollowMarketCode = "moneyline" | "spreads" | "totals";
export type FootballFollowSide = "home" | "away" | "draw" | "over" | "under";
export type FootballFollowConfidence = "exact" | "guess" | "manual" | "none";

export type FootballFollowSelectionKey = {
  matchKey: string;
  venue: string;
  sourceMatchId: string;
  period: FootballFollowPeriod;
  marketCode: FootballFollowMarketCode;
  line: number | null;
  side: FootballFollowSide;
  oddId: string;
  confidence: FootballFollowConfidence;
};

export type FootballFollowSelectionShadow = {
  key: FootballFollowSelectionKey | null;
  legacy: {
    obMid: string;
    oid: string;
    venue: string;
    marketCode: string;
    line: number | null;
    side: PodMarketSide | null;
  };
  sameOddId: boolean;
  reason: string;
};

type BuildSelectionShadowInput = {
  fixtureMatch: Pick<PodFixtureMatch, "status" | "basis">;
  fixture?: Pick<PodBoardFixture, "id" | "obMid" | "pmMid" | "startAt" | "homeName" | "awayName"> | null;
  market: Pick<PodMarketMatch, "status" | "venue" | "ob" | "oid" | "marketCode" | "boardLine" | "line" | "boardSide" | "side">;
};

function normVenue(market: Pick<PodMarketMatch, "venue" | "ob">): string {
  return String(market.venue || (market.ob ? "OB" : "")).trim();
}

function normMarketCode(code: string): FootballFollowMarketCode | null {
  const c = String(code || "").toLowerCase().replace(/^ht_/, "");
  if (c === "moneyline" || c === "spreads" || c === "totals")
    return c;
  return null;
}

function periodFromMarketCode(code: string): FootballFollowPeriod {
  return String(code || "").toLowerCase().startsWith("ht_") ? "half" : "full";
}

function normSide(side: PodMarketSide | null): FootballFollowSide | null {
  if (side === "home" || side === "away" || side === "draw" || side === "over" || side === "under")
    return side;
  return null;
}

function sourceMatchId(fixture: BuildSelectionShadowInput["fixture"], venue: string): string {
  if (!fixture)
    return "";
  if (venue === "OB")
    return String(fixture.obMid || "").trim();
  if (venue === "Polymarket")
    return String(fixture.pmMid || "").trim();
  return "";
}

function fallbackMatchKey(fixture: NonNullable<BuildSelectionShadowInput["fixture"]>): string {
  const home = String(fixture.homeName || "").trim().toLowerCase().replace(/\s+/g, " ");
  const away = String(fixture.awayName || "").trim().toLowerCase().replace(/\s+/g, " ");
  const hour = Math.floor((Number(fixture.startAt) || 0) / 3_600_000);
  return `fixture:${fixture.id}:${hour}:${home}:vs:${away}`;
}

function selectionConfidence(
  fixtureMatch: Pick<PodFixtureMatch, "status" | "basis">,
  market: Pick<PodMarketMatch, "status">,
): FootballFollowConfidence {
  if (fixtureMatch.status !== "matched" || market.status !== "matched")
    return "none";
  return fixtureMatch.basis === "confirmed" ? "exact" : "guess";
}

export function buildFootballFollowSelectionShadow(input: BuildSelectionShadowInput): FootballFollowSelectionShadow {
  const venue = normVenue(input.market);
  const legacy = {
    obMid: String(input.fixture?.obMid || "").trim(),
    oid: String(input.market.oid || "").trim(),
    venue,
    marketCode: String(input.market.marketCode || "").trim(),
    line: input.market.boardLine ?? input.market.line ?? null,
    side: input.market.boardSide || input.market.side || null,
  };

  if (input.fixtureMatch.status !== "matched")
    return { key: null, legacy, sameOddId: false, reason: "fixture_unmatched" };
  if (input.market.status !== "matched")
    return { key: null, legacy, sameOddId: false, reason: "market_unmatched" };
  if (!input.fixture)
    return { key: null, legacy, sameOddId: false, reason: "fixture_missing" };
  const marketCode = normMarketCode(input.market.marketCode);
  if (!marketCode)
    return { key: null, legacy, sameOddId: false, reason: "market_unsupported" };
  const side = normSide(input.market.boardSide || input.market.side || null);
  if (!side)
    return { key: null, legacy, sameOddId: false, reason: "side_missing" };

  const sourceId = sourceMatchId(input.fixture, venue);
  const key: FootballFollowSelectionKey = {
    matchKey: sourceId ? `${venue}:${sourceId}` : fallbackMatchKey(input.fixture),
    venue,
    sourceMatchId: sourceId,
    period: periodFromMarketCode(input.market.marketCode),
    marketCode,
    line: input.market.boardLine ?? input.market.line ?? null,
    side,
    oddId: legacy.oid,
    confidence: selectionConfidence(input.fixtureMatch, input.market),
  };

  return {
    key,
    legacy,
    sameOddId: key.oddId === legacy.oid,
    reason: "ok",
  };
}
