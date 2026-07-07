import { gamebetExtensionId } from "@/config/gamebetExtension";
import { getToken } from "@/api/client";
import { getApiBase } from "@/config/apiBase";
import { getCollectPlatform, updatePlatform } from "@/api/platform";
import { saveLiveTimer } from "@/api/match";
import { getHgFollowOrders } from "@/api/hg";
import { saveUserLog } from "@/api/chat";
import { saveBetOptionLog, saveBetResultLog } from "@/services/bettingLog";
import type { PlatformAccount as WebPlatformAccount } from "@/models/platformAccount";
import { useOddsStore } from "@/stores/oddsStore";
import { useUserStore } from "@/stores/userStore";
import { toFixed } from "@changmen/client-core/shared/format";
import {
  registerBettingLog,
  clearBettingLog,
} from "@changmen/client-core/bridge/bettingLog";
import {
  registerClientApi,
  clearClientApi,
} from "@changmen/client-core/bridge/clientApi";
import {
  registerOddsAccess,
  clearOddsAccess,
} from "@changmen/client-core/bridge/oddsAccess";
import {
  registerPlatformHttpContext,
  clearPlatformHttpContext,
} from "@changmen/client-core/shared/platformHttp";
import {
  registerGamebetExtensionIdResolver,
} from "@changmen/client-core/chrome-plugin/bridge";

/** 注册 client-core 桥接（须在 createPinia 之后、采集/下注启动前调用） */
export function installClientCoreBridges() {
  registerGamebetExtensionIdResolver(gamebetExtensionId);

  registerClientApi({
    getCollectPlatform,
    saveLiveTimer: async (provider, timer) => {
      await saveLiveTimer(provider, timer);
    },
    updatePlatform,
    getHgFollowOrders,
    saveUserLog: async (message, data) => {
      await saveUserLog(message, data);
    },
  });

  const odds = useOddsStore();
  registerOddsAccess({
    read: (provider, itemId, fallback) =>
      odds.getOdds(provider, itemId, fallback) || 0,
    save: (platform, entry, source = "http") => {
      odds.save(platform, {
        id: entry.id,
        odds: Number(toFixed(entry.odds)),
        isLock: entry.isLock,
        betId: entry.betId,
        side: entry.side,
        time: entry.time ?? Date.now(),
        clobPrice: entry.clobPrice,
      }, source);
    },
    clean: platform => odds.clean(platform),
    isOdds: (platform, oddsId) => odds.isOdds(platform, oddsId),
    getEntry: (platform, oddsId) => odds.getEntry(platform, oddsId),
    updateOddsLock: (platform, oddsId, locked) =>
      odds.updateOddsLock(platform, oddsId, locked),
    updateBetLock: (platform, betId, locked) =>
      odds.updateBetLock(platform, betId, locked),
    updateMessage: (platform, payload) => odds.updateMessage(platform, payload),
    getLimit: (platform, oddsId) => odds.getLimit(platform, oddsId),
    setLimit: (platform, oddsId, value, payout, ttlSec) =>
      odds.setLimit(platform, oddsId, value, payout, ttlSec),
  });

  registerPlatformHttpContext({
    getToken: () => getToken(),
    getApiBase: () => getApiBase(),
    getProxyUrl: (proxyId) => {
      const user = useUserStore();
      return user.proxyList.find(p => p.proxyId === proxyId)?.url;
    },
  });

  registerBettingLog({
    saveBetOptionLog: (option, account) =>
      saveBetOptionLog(option, account as WebPlatformAccount),
    saveBetResultLog: (result, account) =>
      saveBetResultLog(result, account as WebPlatformAccount),
  });
}

export function clearClientCoreBridges() {
  clearClientApi();
  clearOddsAccess();
  clearPlatformHttpContext();
  clearBettingLog();
}
