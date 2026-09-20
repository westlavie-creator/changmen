import type { PodBetTicket } from "@/runtime/podBetTicket";
import type { PodFixtureMatch } from "@/runtime/podFixtureMatch";
import type { PodMarketMatch, PodObQuoteCompare } from "@/runtime/podMarketMatch";
import type { FootballFollowSelectionShadow } from "@/runtime/footballFollowSelectionKey";

export type FootballFollowFixtureDecision = {
  status: "matched" | "pending" | "none";
  confidence: "exact" | "guess" | "none";
  reason: string;
};

export type FootballFollowMarketDecision = {
  status: "matched" | "none" | "skipped";
  reason: string;
};

export type FootballFollowQuoteDecision = {
  status: "ok" | "locked" | "below_min" | "missing" | "spike";
  currentOdds: number;
  minOdds: number;
  reason: string;
};

export type FootballFollowActionDecision = {
  canManualPlace: boolean;
  canAutoPlace: boolean;
  blockReason: string | null;
};

export type FootballFollowDecision = {
  ticketId: string;
  fixture: FootballFollowFixtureDecision;
  market: FootballFollowMarketDecision;
  quote: FootballFollowQuoteDecision;
  action: FootballFollowActionDecision;
};

export type ResolveFootballFollowDecisionInput = {
  ticket: Pick<PodBetTicket, "id" | "stake">;
  fixtureMatch: Pick<PodFixtureMatch, "status" | "basis">;
  marketMatch: Pick<PodMarketMatch, "status" | "ob" | "locked" | "oid" | "fromLive">;
  quote: Pick<PodObQuoteCompare, "status" | "quote" | "minObOdds">;
  selectionShadow: Pick<FootballFollowSelectionShadow, "key" | "reason">;
};

function fixtureDecision(
  row: ResolveFootballFollowDecisionInput["fixtureMatch"],
): FootballFollowFixtureDecision {
  if (row.status === "matched") {
    return {
      status: "matched",
      confidence: row.basis === "confirmed" ? "exact" : "guess",
      reason: row.basis === "confirmed" ? "confirmed" : "guess",
    };
  }
  if (row.status === "pending")
    return { status: "pending", confidence: "none", reason: "fixture_ambiguous" };
  return { status: "none", confidence: "none", reason: "fixture_unmatched" };
}

function marketDecision(
  row: ResolveFootballFollowDecisionInput["marketMatch"],
  selection: ResolveFootballFollowDecisionInput["selectionShadow"],
): FootballFollowMarketDecision {
  if (row.status === "skipped")
    return { status: "skipped", reason: "market_skipped" };
  if (row.status !== "matched")
    return { status: "none", reason: "market_unmatched" };
  if (!row.ob)
    return { status: "none", reason: "venue_not_ob" };
  if (!String(row.oid || "").trim())
    return { status: "none", reason: "odd_id_missing" };
  if (!selection.key)
    return { status: "none", reason: selection.reason || "selection_key_missing" };
  return { status: "matched", reason: "matched" };
}

function quoteDecision(
  row: ResolveFootballFollowDecisionInput["quote"],
  market: ResolveFootballFollowDecisionInput["marketMatch"],
): FootballFollowQuoteDecision {
  const currentOdds = Number(row.quote) || 0;
  const minOdds = Number(row.minObOdds) || 0;
  if (market.locked || row.status === "locked")
    return { status: "locked", currentOdds: 0, minOdds, reason: "locked" };
  if (row.status === "ok")
    return { status: "ok", currentOdds, minOdds, reason: "ok" };
  if (row.status === "short")
    return { status: "below_min", currentOdds, minOdds, reason: "below_min" };
  if (row.status === "spike")
    return { status: "spike", currentOdds, minOdds, reason: "spike" };
  return { status: "missing", currentOdds, minOdds, reason: "missing" };
}

function firstBlock(parts: Array<string | null>): string | null {
  return parts.find(Boolean) || null;
}

export function resolveFootballFollowDecision(input: ResolveFootballFollowDecisionInput): FootballFollowDecision {
  const fixture = fixtureDecision(input.fixtureMatch);
  const market = marketDecision(input.marketMatch, input.selectionShadow);
  const quote = quoteDecision(input.quote, input.marketMatch);
  const stake = Number(input.ticket.stake) || 0;
  const blockReason = firstBlock([
    fixture.status !== "matched" ? "场未对上" : null,
    market.status !== "matched" ? "盘未对上" : null,
    quote.status === "locked" ? "锁盘" : null,
    quote.status === "spike" ? "EV 异常" : null,
    quote.status !== "ok" ? "OB 价不够" : null,
    stake > 0 ? null : "注码未设",
  ]);

  return {
    ticketId: input.ticket.id,
    fixture,
    market,
    quote,
    action: {
      canManualPlace: blockReason == null,
      canAutoPlace: blockReason == null
        && fixture.confidence === "exact"
        && input.marketMatch.fromLive === true,
      blockReason,
    },
  };
}
