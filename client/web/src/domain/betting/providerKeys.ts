import type { PlatformId } from "@/types/esport";

/** UI / Telegram：盘口上全部平台参与套利检测 */
export type ArbProviderScope = "display" | "auto";

export function providerKeysFromBetItems(bet: {
  items: { type: PlatformId }[];
}): PlatformId[] {
  return bet.items.map((item) => item.type);
}

/**
 * 收口套利检测用的平台列表。
 * - display：列表红线、Telegram 提醒（不依赖账号余额）
 * - auto：自动投注（仅有在线账号的平台）
 */
export function resolveArbProviderKeys(
  scope: ArbProviderScope,
  ctx: {
    bet?: { items: { type: PlatformId }[] };
    accountProviderKeys?: Iterable<PlatformId>;
  },
): PlatformId[] {
  if (scope === "display") {
    return ctx.bet ? providerKeysFromBetItems(ctx.bet) : [];
  }
  return ctx.accountProviderKeys ? [...ctx.accountProviderKeys] : [];
}
