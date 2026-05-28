import type { CollectHttpSession } from "@/collectors/shared/collectSession";
import { pbPluginGet } from "@/collectors/pb/pluginHttp";
import { PlatformAccount } from "@/models/platformAccount";

function pbSessionAccount(session: CollectHttpSession): PlatformAccount {
  return new PlatformAccount({
    accountId: 0,
    provider: "PB",
    playerName: "",
    gateway: session.gateway,
    token: session.token,
    referer: session.referer,
    userAgent: session.userAgent,
    currency: "CNY",
    updateTime: Date.now(),
  });
}

/** 对齐 A8 `_Ze`：`Zn.get` euro/odds */
export async function collectPbGet<T>(session: CollectHttpSession, url: string): Promise<T> {
  return pbPluginGet<T>(pbSessionAccount(session), url);
}
