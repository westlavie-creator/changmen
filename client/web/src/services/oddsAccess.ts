import type { PlatformId } from "@/types/esport";
import { toFixed } from "@/shared/format";
import { useOddsStore } from "@/stores/oddsStore";

export function readVenueOdds(
  provider: PlatformId,
  itemId: string,
  fallback = 0,
): number {
  return useOddsStore().getOdds(provider, itemId, fallback) || 0;
}

export function writeVenueOdds(provider: PlatformId, payload: {
  id: string;
  odds: number;
  betId: string;
  isLock?: boolean;
  time?: number;
}): void {
  useOddsStore().save(provider, {
    id: payload.id,
    odds: Number(toFixed(payload.odds)),
    isLock: payload.isLock ?? false,
    betId: payload.betId,
    time: payload.time ?? Date.now(),
  });
}

