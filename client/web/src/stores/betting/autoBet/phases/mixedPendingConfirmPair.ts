import type { BetOption } from "@changmen/client-core/models/betOption";
import { isPendingConfirmVenueProvider } from "@changmen/shared/account_multiply";

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
