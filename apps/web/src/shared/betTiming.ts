import type { BetSide } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";

/** 结果通知停留秒数 — 对齐 A8 Io.betting 第三参（waitTime，-1 表示 0） */
export function betToastSeconds(config: UserConfig, provider: string): number {
  const wait = config.waitTime[provider];
  if (wait === -1) return 0;
  return Math.max(wait ?? 0, 10);
}

const BET_COUNT_PREFIX = "BETCOUNT:";
const GAME_BET_COUNT_PREFIX = "GAMEBETCOUNT:";

/** 对齐 bundle `B` / `$`：成功下单后记录赔率，lastOdds 开启时拒重复低赔 */
const lastOddsByKey = new Map<string, number>();

function lastOddsKey(accountId: number, betId: number, side: BetSide): string {
  return `${accountId}:${betId}:${side}`;
}

export function getLastBetOdds(
  accountId: number,
  betId: number,
  side: BetSide,
): number | undefined {
  return lastOddsByKey.get(lastOddsKey(accountId, betId, side));
}

export function setLastBetOdds(
  accountId: number,
  betId: number,
  side: BetSide,
  odds: number,
): void {
  lastOddsByKey.set(lastOddsKey(accountId, betId, side), odds);
}

export function passesLastOddsGate(
  account: PlatformAccount,
  betId: number,
  side: BetSide,
  currentOdds: number,
): boolean {
  if (!account.lastOdds) return true;
  const prev = getLastBetOdds(account.accountId, betId, side);
  if (prev != null && prev >= currentOdds) return false;
  return true;
}

/** 对齐 bundle `T()`：同账号同场同边已下注次数 */
export function readBetCount(accountId: number, betId: number, side: BetSide): number {
  try {
    const raw = sessionStorage.getItem(`${BET_COUNT_PREFIX}${accountId}:${betId}:${side}`);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function incrementBetCount(accountId: number, betId: number, side: BetSide): void {
  const key = `${BET_COUNT_PREFIX}${accountId}:${betId}:${side}`;
  const next = readBetCount(accountId, betId, side) + 1;
  sessionStorage.setItem(key, String(next));
}

export function passesMaxBetCount(
  account: PlatformAccount,
  betId: number,
  side: BetSide,
): boolean {
  if (!account.maxBetCount) return true;
  return readBetCount(account.accountId, betId, side) < account.maxBetCount;
}

/** 对齐 A8 账号游戏配置「订单数」：按账号 + 游戏名累计成功下注次数 */
export function readGameBetCount(accountId: number, gameName: string): number {
  try {
    const raw = sessionStorage.getItem(`${GAME_BET_COUNT_PREFIX}${accountId}:${gameName}`);
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}

export function incrementGameBetCount(accountId: number, gameName: string): void {
  const key = `${GAME_BET_COUNT_PREFIX}${accountId}:${gameName}`;
  sessionStorage.setItem(key, String(readGameBetCount(accountId, gameName) + 1));
}
