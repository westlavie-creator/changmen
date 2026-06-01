import type { PlatformId } from "@/types/esport";
import { ALL_PLATFORMS } from "@/platforms/registry";

export type BetSorting = "Low" | "High" | "Parallel" | "WinRate" | "Custom";

export { ALL_PLATFORMS };

/** 对齐 A8 bundle `D8` 用户参数（阶段 2 常用字段） */
export interface UserConfig {
  betting: boolean;
  bettingAutoOpen: boolean;
  bettingAutoOpenTime: number;
  betMoney: number;
  minMoney: number;
  maxMoney: number;
  tenNumber: boolean;
  makeUp: boolean;
  makeUp_odds: number;
  makeUp_defaultOdds: number;
  makeProfit: number;
  noSameProvider: boolean;
  noSameBet: boolean;
  /** 对齐 A8 `D8.allowSameBet`：`noSameBet` 时仍允许这些平台参与选腿 */
  allowSameBet: PlatformId[];
  anyOdds: boolean;
  anyOddsProfit: number;
  betSorting: BetSorting;
  winRateValue: number;
  providerSortValue: PlatformId[];
  providerFixed: PlatformId[];
  profit: number;
  maxProfit: number;
  minOdds: number;
  maxOdds: number;
  betCount: number;
  betInterval: number;
  checkTimeout: number;
  betChecked: boolean;
  singleBet: boolean;
  waitTime: Record<string, number>;
}

export function createDefaultUserConfig(): UserConfig {
  return {
    betting: false,
    bettingAutoOpen: false,
    bettingAutoOpenTime: 0,
    betMoney: 100,
    minMoney: 0,
    maxMoney: 0,
    tenNumber: false,
    makeUp: false,
    makeUp_odds: 0,
    makeUp_defaultOdds: 0,
    makeProfit: 1.01,
    noSameProvider: false,
    noSameBet: false,
    allowSameBet: ["PB"],
    anyOdds: false,
    anyOddsProfit: 0.95,
    betSorting: "Custom",
    winRateValue: 0.15,
    providerSortValue: [...ALL_PLATFORMS],
    providerFixed: ["IM"],
    profit: 1.03,
    maxProfit: 1.2,
    minOdds: 1.3,
    maxOdds: 10,
    betCount: 0,
    betInterval: 30,
    checkTimeout: 3000,
    betChecked: false,
    singleBet: false,
    waitTime: {},
  };
}

export function mergeUserConfig(raw: Partial<UserConfig> | null | undefined): UserConfig {
  const base = createDefaultUserConfig();
  if (!raw || typeof raw !== "object") return base;
  return {
    ...base,
    ...raw,
    providerSortValue: Array.isArray(raw.providerSortValue)
      ? (raw.providerSortValue as PlatformId[])
      : base.providerSortValue,
    providerFixed: Array.isArray(raw.providerFixed)
      ? (raw.providerFixed as PlatformId[])
      : base.providerFixed,
    allowSameBet: Array.isArray(raw.allowSameBet)
      ? (raw.allowSameBet as PlatformId[])
      : base.allowSameBet,
    waitTime: raw.waitTime && typeof raw.waitTime === "object" ? raw.waitTime : base.waitTime,
  };
}
