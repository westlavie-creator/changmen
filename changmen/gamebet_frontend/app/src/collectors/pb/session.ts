import type { CollectHttpSession } from "@/collectors/shared/collectSession";
import type { PlatformAccount } from "@/models/platformAccount";
import { PLATFORMS } from "@/shared/platform";
import { useAccountStore } from "@/stores/accountStore";

/** 对齐 A8 `AQ` 的 `bv`：须为 PB 且已刷出余额 */
export function resolvePbCollectAccount(): PlatformAccount | undefined {
  return useAccountStore().accounts.find(
    (a) => a.provider === PLATFORMS.PB && a.gateway && a.token && a.balance !== undefined,
  );
}

export function pbCollectSessionFromAccount(account: PlatformAccount): CollectHttpSession {
  return {
    gateway: account.gateway!,
    token: account.token!,
    referer: account.referer,
    userAgent: account.userAgent,
  };
}
