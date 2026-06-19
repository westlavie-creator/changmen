import { ALL_PLATFORMS, type BetSorting, type UserConfig } from "@/types/userConfig";

export const USER_CONFIG_LABEL_W = "80px";

export const BET_SORTING_LABELS: Record<BetSorting, string> = {
  Low: "低赔优先",
  High: "高赔优先",
  Parallel: "并行投注",
  WinRate: "胜率优先",
  Custom: "自定义顺序",
};

export const BET_SORTING_KEYS = Object.keys(BET_SORTING_LABELS) as BetSorting[];

export type UserConfigFormState = ReturnType<typeof createUserConfigFormState>;

/** 与 A8 一致：文本框绑定，保存时再 Number() */
export function createUserConfigFormState(src: UserConfig) {
  return {
    ...src,
    minOdds: String(src.minOdds ?? ""),
    checkTimeout: String(src.checkTimeout ?? 3000),
    providerSortValue: [...src.providerSortValue],
    providerFixed: [...src.providerFixed],
    allowSameBet: [...(src.allowSameBet ?? [])],
    waitTime: { ...src.waitTime },
  };
}

export function waitTimePlatformPairs() {
  const pairs: (typeof ALL_PLATFORMS)[number][][] = [];
  for (let i = 0; i < ALL_PLATFORMS.length; i += 2) {
    pairs.push(ALL_PLATFORMS.slice(i, i + 2));
  }
  return pairs;
}
