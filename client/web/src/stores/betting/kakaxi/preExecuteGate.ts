import { pickArbLegs, type ArbLegs } from "@/domain/arbitrage";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";
import { useLoseOrderStore } from "@/stores/loseOrderStore";
import { isKakaxiBetOnCooldown, setKakaxiBetCooldown } from "@/stores/betting/kakaxi/cooldown";
import { KAKAXI_QUEUE_TTL_MS } from "@/stores/betting/kakaxi/config";
import type { KakaxiQueuedBet } from "@/stores/betting/kakaxi/types";

export type KakaxiPreGateSkipReason =
  | "cooldown"
  | "ttl"
  | "lose_order"
  | "no_legs"
  | "below_profit"
  | "stale_implied";

export interface KakaxiPreGateResult {
  ok: boolean;
  reason?: KakaxiPreGateSkipReason;
  implied?: number;
}

/**
 * executeArbBet 前的轻量闸门（仅 kakaxi；不修改 A8 / execute 管线）。
 * 可传入已算好的 legs，避免与 scheduler 重复 pickArbLegs。
 */
export function passesKakaxiPreExecuteGate(params: {
  match: ViewMatch;
  bet: ViewBet;
  item: KakaxiQueuedBet;
  config: UserConfig;
  providerKeys: PlatformId[];
  accounts: PlatformAccount[];
  legs?: ArbLegs;
  now?: number;
}): KakaxiPreGateResult {
  const { match, bet, item, config, providerKeys, accounts } = params;
  const now = params.now ?? Date.now();

  if (isKakaxiBetOnCooldown(item.matchId, item.betId)) {
    return { ok: false, reason: "cooldown" };
  }
  if (now - item.enqueuedAt > KAKAXI_QUEUE_TTL_MS) {
    return { ok: false, reason: "ttl" };
  }
  if (useLoseOrderStore().orders.has(item.betId)) {
    return { ok: false, reason: "lose_order" };
  }

  let legs = params.legs;
  if (!legs) {
    bet.items.forEach((row) => row.updateOdds());
    legs = pickArbLegs(bet, config, providerKeys, accounts, match.game);
  }
  if (!legs) {
    setKakaxiBetCooldown(item.matchId, item.betId);
    return { ok: false, reason: "no_legs" };
  }
  if (legs.implied < config.profit) {
    setKakaxiBetCooldown(item.matchId, item.betId);
    return { ok: false, reason: "below_profit" };
  }
  if (legs.implied + 0.001 < item.implied) {
    return { ok: false, reason: "stale_implied", implied: legs.implied };
  }

  return { ok: true, implied: legs.implied };
}

/** 闸门失败后是否应回队（保留 enqueuedAt） */
export function shouldRequeueAfterKakaxiGate(
  reason: KakaxiPreGateSkipReason | undefined,
): boolean {
  return reason === "stale_implied";
}
