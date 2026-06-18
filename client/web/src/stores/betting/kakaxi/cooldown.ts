import { kakaxiBetKey } from "@/stores/betting/kakaxi/types";
import { KAKAXI_BET_COOLDOWN_MS } from "@/stores/betting/kakaxi/config";

const untilByKey = new Map<string, number>();

export function setKakaxiBetCooldown(
  matchId: number,
  betId: number,
  ms = KAKAXI_BET_COOLDOWN_MS,
): void {
  untilByKey.set(kakaxiBetKey(matchId, betId), Date.now() + ms);
}

export function isKakaxiBetOnCooldown(matchId: number, betId: number): boolean {
  const key = kakaxiBetKey(matchId, betId);
  const until = untilByKey.get(key);
  if (!until) return false;
  if (Date.now() >= until) {
    untilByKey.delete(key);
    return false;
  }
  return true;
}

export function clearKakaxiCooldowns(): void {
  untilByKey.clear();
}
