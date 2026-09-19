import type { BetOption } from "@changmen/client-core/models/betOption";
import { isPendingConfirmVenueProvider } from "@changmen/shared/account_multiply";
import { venueCheckBetProbesBetEndpoint } from "@changmen/venue-adapter/shared";

/** 一腿 PM/PF、一腿即时冻价馆。A8↔A8、PM↔PF 都不是。 */
export function isMixedPendingConfirmArbPair(
  typeA: unknown,
  typeB: unknown,
): boolean {
  return isPendingConfirmVenueProvider(typeA) !== isPendingConfirmVenueProvider(typeB);
}

export function isInstantFreezeVenueProvider(provider: unknown): boolean {
  return !isPendingConfirmVenueProvider(provider);
}

/** 混合对里即时冻价馆是否为 A 腿 */
export function mixedInstantIsLegA(legA: BetOption, legB: BetOption): boolean {
  return isInstantFreezeVenueProvider(legA.type) && isPendingConfirmVenueProvider(legB.type);
}

/**
 * 混合对能否作废第一次冻价、临下单按检测价重锁。
 * RAY 等报价型 checkBet 可以重来；OB/TF 的 checkBet 是真实下单端点探测单，
 * 重来一次就是同一注单的重复提交（OB 回「请勿重复提交」→ 两腿都下不出去）。
 */
export function canRelockInstantQuote(provider: unknown): boolean {
  return isInstantFreezeVenueProvider(provider) && !venueCheckBetProbesBetEndpoint(provider);
}
