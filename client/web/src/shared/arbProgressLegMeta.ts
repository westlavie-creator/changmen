import type { BetOption } from "@/models/betOption";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ArbProgressLegMeta } from "@/stores/betting/autoBet/arbExecutionTrace";
import { buildPolymarketArbProgressMeta } from "@/domain/polymarket/arbProgressPmMeta";
import { formatLegAccount } from "@/shared/arbBetTraceFormat";
import { PLATFORMS } from "@/shared/platform";

export function buildArbProgressLegMeta(
  side: ArbProgressLegMeta["side"],
  leg: BetOption,
  account?: PlatformAccount | null,
  precheck?: { ok: boolean; error?: string },
): ArbProgressLegMeta {
  const meta: ArbProgressLegMeta = {
    side,
    platform: leg.type,
    target: leg.target,
    odds: leg.odds,
    betMoney: leg.betMoney,
    account: account ? formatLegAccount(leg.type, account.playerName) : undefined,
  };
  if (!precheck)
    return meta;

  meta.precheck = {
    ok: precheck.ok,
    error: precheck.error,
  };
  if (leg.type === PLATFORMS.Polymarket) {
    meta.precheck.polymarket = buildPolymarketArbProgressMeta(leg);
  }
  return meta;
}

export function buildArbProgressLegPair(
  legA: BetOption,
  legB: BetOption,
  accountA?: PlatformAccount | null,
  accountB?: PlatformAccount | null,
  precheck?: {
    legA?: { ok: boolean; error?: string };
    legB?: { ok: boolean; error?: string };
  },
): ArbProgressLegMeta[] {
  return [
    buildArbProgressLegMeta("A", legA, accountA, precheck?.legA),
    buildArbProgressLegMeta("B", legB, accountB, precheck?.legB),
  ];
}
