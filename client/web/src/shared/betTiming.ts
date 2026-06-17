import type { BetSide } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { UserConfig } from "@/types/userConfig";

/** [A8 可证实] D8 构造：逐键 `Number(waitTime[k])||0` */
export function normalizeWaitTime(
  raw: Record<string, unknown> | undefined | null,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of Object.keys(raw)) {
    out[key] = Number(raw[key]) || 0;
  }
  return out;
}

/** 自动套利 Oe：`Math.max(waitTime[a]??0, waitTime[b]??0, 10)`（-1 不单独分支，由 floor 10 兜底） */
export function arbBetToastSeconds(config: UserConfig, providers: string[]): number {
  const waits = providers.map((p) => config.waitTime[p] ?? 0);
  if (!waits.length) return 10;
  return Math.max(...waits, 10);
}

/** 补单 Pe：`waitTime===-1 ? 0 : Math.max(waitTime??0, 10)` */
export function makeUpBetToastSeconds(config: UserConfig, provider: string): number {
  const wait = config.waitTime[provider];
  if (wait === -1) return 0;
  return Math.max(wait ?? 0, 10);
}

/** 手动下单 `v=async(_,A,T=10)` 默认第三参，不读 waitTime */
export const MANUAL_BET_TOAST_SECONDS = 10;

export function manualBetToastSeconds(): number {
  return MANUAL_BET_TOAST_SECONDS;
}

const BET_COUNT_PREFIX = "BETCOUNT:";

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
