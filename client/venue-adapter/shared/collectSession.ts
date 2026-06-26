import { getCollectPlatform } from "@/api/esport";
import type { PlatformId } from "@/types/esport";
import { useAccountStore } from "@/stores/accountStore";

/** PB / IMT 等需 gateway+token 的采集会话（优先已登录账号，回退 platforms.json） */
export interface CollectHttpSession {
  gateway: string;
  token: string;
  referer?: string;
  userAgent?: string;
  xSc?: string;
}

export async function resolveCollectSession(
  provider: PlatformId,
  opts: { preferAccountWithBalance?: boolean; allowPlatformFallback?: boolean } = {},
): Promise<CollectHttpSession | null> {
  const { preferAccountWithBalance = true, allowPlatformFallback = true } = opts;
  const accounts = useAccountStore().accounts;

  const acc = accounts.find((a) => {
    if (a.provider !== provider || !a.gateway || !a.token) return false;
    if (preferAccountWithBalance && a.balance === undefined) return false;
    return true;
  });

  if (acc) {
    return {
      gateway: acc.gateway!,
      token: acc.token!,
      referer: acc.referer,
      userAgent: acc.userAgent,
    };
  }

  if (!allowPlatformFallback)
    return null;

  const platform = await getCollectPlatform(provider);
  if (platform?.Gateway && platform.Token) {
    return {
      gateway: platform.Gateway,
      token: platform.Token,
    };
  }

  return null;
}
