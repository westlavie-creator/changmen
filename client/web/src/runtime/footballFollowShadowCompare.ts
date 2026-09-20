import type { FootballFollowDecision } from "@/runtime/footballFollowDecision";
import type { FootballFollowSelectionShadow } from "@/runtime/footballFollowSelectionKey";
import type { FootballQuote } from "@/runtime/footballQuote";
import type { PodMarketMatch, PodObQuoteCompare } from "@/runtime/podMarketMatch";

export type FootballFollowShadowCompare = {
  ok: boolean;
  reasons: string[];
  summary: string;
};

export type CompareFootballFollowShadowInput = {
  marketMatch: Pick<PodMarketMatch, "status" | "oid" | "quote" | "locked">;
  obQuote: Pick<PodObQuoteCompare, "status" | "quote">;
  selectionShadow: {
    key: Pick<
      NonNullable<FootballFollowSelectionShadow["key"]>,
      "sourceMatchId" | "period" | "marketCode" | "line" | "side" | "oddId" | "confidence"
    > | null;
    legacy: Pick<FootballFollowSelectionShadow["legacy"], "obMid" | "marketCode" | "line" | "side" | "oid" | "venue">;
    reason: string;
    sameOddId: boolean;
  };
  quoteShadow: Pick<FootballQuote, "odds" | "locked" | "source">;
  decisionShadow: Pick<FootballFollowDecision, "action">;
  legacyBlock?: string | null;
};

const QUOTE_TOLERANCE = 0.01;

function finitePositive(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function quoteDelta(a: number, b: number): number {
  return Math.abs(a - b);
}

function normText(value: unknown): string {
  return String(value || "").trim();
}

function normLine(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sameLine(left: unknown, right: unknown): boolean {
  const a = normLine(left);
  const b = normLine(right);
  if (a == null && b == null)
    return true;
  if (a == null || b == null)
    return false;
  return Math.abs(a - b) <= 1e-6;
}

function normMarketCode(code: unknown): string {
  return normText(code).toLowerCase().replace(/^ht_/, "");
}

function periodFromLegacyMarket(code: unknown): "full" | "half" | "" {
  const raw = normText(code).toLowerCase();
  if (!raw)
    return "";
  return raw.startsWith("ht_") ? "half" : "full";
}

export function compareFootballFollowShadow(input: CompareFootballFollowShadowInput): FootballFollowShadowCompare {
  const reasons: string[] = [];
  const legacyOid = String(input.marketMatch.oid || "").trim();
  const shadowOid = String(input.selectionShadow.key?.oddId || "").trim();
  const legacy = input.selectionShadow.legacy;
  const key = input.selectionShadow.key;

  if (input.marketMatch.status === "matched") {
    if (!key)
      reasons.push(`key:${input.selectionShadow.reason || "missing"}`);
    else {
      if (normText(legacy.venue) === "OB" && normText(legacy.obMid) !== normText(key.sourceMatchId))
        reasons.push(`mid:${normText(legacy.obMid) || "-"}->${normText(key.sourceMatchId) || "-"}`);
      if (periodFromLegacyMarket(legacy.marketCode) !== key.period)
        reasons.push(`period:${periodFromLegacyMarket(legacy.marketCode) || "-"}->${key.period}`);
      if (normMarketCode(legacy.marketCode) !== key.marketCode)
        reasons.push(`market:${normMarketCode(legacy.marketCode) || "-"}->${key.marketCode}`);
      if (!sameLine(legacy.line, key.line))
        reasons.push(`line:${normLine(legacy.line) ?? "-"}->${normLine(key.line) ?? "-"}`);
      if (normText(legacy.side) !== key.side)
        reasons.push(`side:${normText(legacy.side) || "-"}->${key.side}`);
      if (legacyOid && shadowOid !== legacyOid)
        reasons.push(`oid:${legacyOid}->${shadowOid}`);
      else if (!input.selectionShadow.sameOddId)
        reasons.push("oid:not_same");
    }
  }

  const legacyLocked = input.marketMatch.locked || input.obQuote.status === "locked";
  if (legacyLocked !== input.quoteShadow.locked)
    reasons.push(`lock:${legacyLocked ? "legacy" : "shadow"}`);

  if (!legacyLocked && !input.quoteShadow.locked) {
    const legacyQuote = finitePositive(input.obQuote.quote) || finitePositive(input.marketMatch.quote);
    const shadowQuote = finitePositive(input.quoteShadow.odds);
    if (legacyQuote > 0 && shadowQuote > 0 && quoteDelta(legacyQuote, shadowQuote) > QUOTE_TOLERANCE)
      reasons.push(`quote:${legacyQuote}->${shadowQuote}`);
  }

  const blocked = input.decisionShadow.action.blockReason;
  if (blocked && input.marketMatch.status === "matched" && input.obQuote.status === "ok" && !legacyLocked)
    reasons.push(`decision:${blocked}`);

  const legacyBlock = normText(input.legacyBlock);
  const shadowBlock = normText(input.decisionShadow.action.blockReason);
  if (legacyBlock !== shadowBlock)
    reasons.push(`gate:${legacyBlock || "ok"}->${shadowBlock || "ok"}`);

  return {
    ok: reasons.length === 0,
    reasons,
    summary: reasons.length ? reasons.join(",") : "ok",
  };
}
